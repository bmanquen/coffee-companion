#!/usr/bin/env node
// Control CLI for Coffee Companion mobile verification. See SKILL.md.
// Agents drive the welcome screen through React Native Testing Library
// against a dedicated Expo Metro instance. This is not an iOS simulator
// or Android emulator.

import { spawn, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'

const here = dirname(fileURLToPath(import.meta.url))
const skillDir = resolve(here, '..')
const repoRoot = process.env.VERIFY_REPO_ROOT ?? resolve(skillDir, '../../..')
const mobileDir = join(repoRoot, 'apps/mobile')
const runDir = join(skillDir, '.run')
const statePath = join(runDir, 'state.json')
const artifactsDir = join(skillDir, 'artifacts')

const DEFAULT_METRO_PORT = Number(process.env.VERIFY_METRO_PORT ?? 8081)
const EXIT_NOT_DRIVABLE = 2
const METRO_READY_MARKER = 'packager-status:running'
const APP_MARKER = 'Coffee Companion'
const HTTP_OK_MIN = 200
const HTTP_OK_MAX = 400
const SIGTERM = 'SIGTERM'
const LAUNCH_STATUS_TIMEOUT_MS = 60_000
const LAUNCH_BUNDLE_TIMEOUT_MS = 120_000
const DOCTOR_FETCH_TIMEOUT_MS = 15_000
const BUNDLE_REQUEST_CAP_MS = 20_000
const BUNDLE_RETRY_SLEEP_MS = 500

const BUNDLE_PATHS = [
  '/apps/mobile/index.bundle?platform=android&dev=true&minify=false',
  '/apps/mobile/index.ts.bundle?platform=android&dev=true&minify=false',
]

function die(message, code = 1) {
  console.error(message)
  process.exit(code)
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true })
}

function readState() {
  if (!existsSync(statePath)) return null
  return JSON.parse(readFileSync(statePath, 'utf8'))
}

function requireState() {
  const state = readState()
  if (!state) {
    die('No verification instance is recorded. Run `helpers/control launch` first.')
  }
  return state
}

function writeState(state) {
  ensureDir(runDir)
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`)
}

function pidAlive(pid) {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function run(command, args, opts = {}) {
  const result = spawnSync(command, args, {
    cwd: opts.cwd ?? repoRoot,
    env: { ...process.env, ...opts.env },
    stdio: opts.stdio ?? 'inherit',
    encoding: 'utf8',
  })
  if (result.status !== 0 && !opts.allowFail) {
    die(`${command} ${args.join(' ')} exited ${result.status}`)
  }
  return result
}

function runCapture(command, args, opts = {}) {
  return run(command, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] })
}

function isMetroReady(body) {
  return typeof body === 'string' && body.includes(METRO_READY_MARKER)
}

function bundleHasAppMarker(body) {
  return typeof body === 'string' && body.includes(APP_MARKER)
}

function portListenerPids(port) {
  const pids = new Set()
  const lsof = runCapture(
    'lsof',
    ['-t', `-iTCP:${port}`, '-sTCP:LISTEN', '-n', '-P'],
    { allowFail: true },
  )
  for (const line of `${lsof.stdout ?? ''}`.split('\n')) {
    const pid = Number(line.trim())
    if (pid) pids.add(pid)
  }
  if (pids.size > 0) return [...pids]

  const ss = runCapture('ss', ['-lntp'], { allowFail: true })
  const text = `${ss.stdout ?? ''}\n${ss.stderr ?? ''}`
  for (const line of text.split('\n')) {
    if (!line.includes(`:${port}`)) continue
    for (const match of line.matchAll(/pid=(\d+)/g)) {
      pids.add(Number(match[1]))
    }
  }
  return [...pids]
}

function refuseIfPortBusy(port) {
  const pids = portListenerPids(port)
  if (pids.length === 0) return
  die(
    `Port ${port} is already in use (pids ${pids.join(', ')}). ` +
      'Do not drive a shared Metro — that is likely `pnpm --filter @coffee-companion/mobile start`. ' +
      'Stop that process, or set VERIFY_METRO_PORT to a free port and launch a dedicated instance.',
  )
}

async function fetchText(url, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: controller.signal,
    })
    const body = await response.text()
    return { status: response.status, body }
  } finally {
    clearTimeout(timer)
  }
}

async function waitForMetro(baseUrl, timeoutMs) {
  const start = Date.now()
  const statusUrl = `${baseUrl}/status`
  while (Date.now() - start < timeoutMs) {
    try {
      const { status, body } = await fetchText(statusUrl, 2_000)
      if (status >= HTTP_OK_MIN && status < HTTP_OK_MAX && isMetroReady(body)) {
        return
      }
    } catch {
      // still booting
    }
    await sleep(250)
  }
  throw new Error(`Timed out waiting for Metro at ${statusUrl}`)
}

async function fetchAppBundle(baseUrl, timeoutMs) {
  const start = Date.now()
  let lastError = 'no bundle URL answered'
  while (Date.now() - start < timeoutMs) {
    for (const path of BUNDLE_PATHS) {
      const remainingMs = timeoutMs - (Date.now() - start)
      if (remainingMs <= 0) {
        throw new Error(`Timed out waiting for an app bundle: ${lastError}`)
      }
      const url = `${baseUrl}${path}`
      try {
        const { status, body } = await fetchText(
          url,
          Math.min(BUNDLE_REQUEST_CAP_MS, remainingMs),
        )
        if (status >= HTTP_OK_MIN && status < HTTP_OK_MAX && body.length > 0) {
          return { url, status, body }
        }
        lastError = `GET ${url} returned ${status}`
      } catch (error) {
        lastError = `GET ${url} failed: ${error.message}`
      }
    }
    const remainingMs = timeoutMs - (Date.now() - start)
    if (remainingMs <= 0) break
    await sleep(Math.min(BUNDLE_RETRY_SLEEP_MS, remainingMs))
  }
  throw new Error(`Timed out waiting for an app bundle: ${lastError}`)
}

function stopRecordedPid(pid, kind, stopped) {
  if (!pid || !pidAlive(pid)) return
  try {
    process.kill(-pid, SIGTERM)
    stopped.push({ kind, pid, group: true })
    return
  } catch {
    // process is not a group leader — fall through to the pid itself
  }
  try {
    process.kill(pid, SIGTERM)
    stopped.push({ kind, pid })
  } catch {
    // already gone
  }
}

async function cmdLaunch() {
  const existing = readState()
  if (existing?.metroPid && pidAlive(existing.metroPid)) {
    die(
      `A verification instance is already running (pid ${existing.metroPid} at ${existing.baseUrl}). ` +
        'Drive that one, or run `helpers/control cleanup` first. Do not double-drive.',
    )
  }

  const port = DEFAULT_METRO_PORT
  refuseIfPortBusy(port)

  ensureDir(runDir)
  ensureDir(artifactsDir)

  if (!existsSync(join(repoRoot, 'node_modules'))) {
    console.error('Installing workspace dependencies…')
    run('pnpm', ['install', '--frozen-lockfile'])
  }

  const logPath = join(runDir, 'metro.log')
  const logFd = openSync(logPath, 'w')
  const metro = spawn(
    'pnpm',
    ['exec', 'expo', 'start', '--port', String(port), '--localhost'],
    {
      cwd: mobileDir,
      env: {
        ...process.env,
        CI: '1',
        EXPO_NO_TELEMETRY: '1',
        BROWSER: 'none',
      },
      stdio: ['ignore', logFd, logFd],
      detached: true,
    },
  )
  metro.unref()

  // Expo `--localhost` binds ::1 here. 127.0.0.1 does not reach it.
  const baseUrl = `http://localhost:${port}`
  try {
    await waitForMetro(baseUrl, LAUNCH_STATUS_TIMEOUT_MS)
    const bundle = await fetchAppBundle(baseUrl, LAUNCH_BUNDLE_TIMEOUT_MS)
    if (!bundleHasAppMarker(bundle.body)) {
      throw new Error(
        `Metro answered but the bundle at ${bundle.url} does not mention ${APP_MARKER}. ` +
          'This instance is not the Coffee Companion mobile app.',
      )
    }

    const metroPids = [...new Set([metro.pid, ...portListenerPids(port)].filter(Boolean))]
    const state = {
      runId: `verify-${new Date().toISOString().replace(/[:.]/g, '-')}`,
      metroPid: metro.pid,
      metroPids,
      port,
      baseUrl,
      bundleUrl: bundle.url,
      logPath,
      startedAt: new Date().toISOString(),
      harness: 'rntl',
    }
    writeState(state)

    console.log(
      JSON.stringify(
        {
          ok: true,
          runId: state.runId,
          baseUrl,
          metroPid: metro.pid,
          bundleUrl: bundle.url,
          ready: `GET ${baseUrl}/status is ${METRO_READY_MARKER}; bundle mentions ${APP_MARKER}`,
          harness: 'rntl',
          platformsDriven: [],
          note:
            'Metro is up. Drive uses React Native Testing Library in-process. ' +
            'This launch did not attach an iOS simulator or Android emulator.',
        },
        null,
        2,
      ),
    )
  } catch (error) {
    // Only the process we spawned (and its group). Do not SIGTERM whatever
    // happens to be listening on the port after a race.
    stopRecordedPid(metro.pid, 'metro', [])
    die(error.message)
  }
}

async function inspectMetro(state, timeoutMs = DOCTOR_FETCH_TIMEOUT_MS) {
  const problems = []

  if (!pidAlive(state.metroPid)) {
    problems.push(`metro pid ${state.metroPid} is not running`)
  }

  const listeners = portListenerPids(state.port)
  if (listeners.length === 0) {
    problems.push(`nothing is listening on port ${state.port}`)
  } else if (state.metroPid && !listeners.includes(state.metroPid)) {
    const groupMatch = listeners.some((pid) => {
      try {
        const pgid = Number(
          runCapture('ps', ['-o', 'pgid=', '-p', String(pid)], {
            allowFail: true,
          }).stdout,
        )
        return pgid === state.metroPid
      } catch {
        return false
      }
    })
    if (!groupMatch) {
      problems.push(
        `port ${state.port} is owned by pid(s) ${listeners.join(', ')}, not the launched Metro ${state.metroPid}`,
      )
    }
  }

  let status = null
  let metroMarker = false
  try {
    const response = await fetchText(`${state.baseUrl}/status`, timeoutMs)
    status = response.status
    metroMarker = isMetroReady(response.body)
    if (status < HTTP_OK_MIN || status >= HTTP_OK_MAX) {
      problems.push(`GET ${state.baseUrl}/status returned ${status}`)
    }
    if (!metroMarker) {
      problems.push(
        `GET ${state.baseUrl}/status body is not ${METRO_READY_MARKER}`,
      )
    }
  } catch (error) {
    problems.push(`GET ${state.baseUrl}/status failed: ${error.message}`)
  }

  let bundleStatus = null
  let appMarker = false
  let bundleUrl = state.bundleUrl ?? `${state.baseUrl}${BUNDLE_PATHS[0]}`
  try {
    const bundle = await fetchAppBundle(state.baseUrl, timeoutMs)
    bundleUrl = bundle.url
    bundleStatus = bundle.status
    appMarker = bundleHasAppMarker(bundle.body)
    if (!appMarker) {
      problems.push(`bundle at ${bundle.url} does not mention ${APP_MARKER}`)
    }
  } catch (error) {
    problems.push(`app bundle check failed: ${error.message}`)
  }

  return {
    ok: problems.length === 0,
    baseUrl: state.baseUrl,
    metroPid: state.metroPid,
    port: state.port,
    portOwners: listeners,
    httpStatus: status,
    metroMarker: metroMarker ? METRO_READY_MARKER : null,
    bundleUrl,
    bundleStatus,
    appMarker: appMarker ? APP_MARKER : null,
    harness: 'rntl',
    problems,
  }
}

async function requireDrivableMetro(state) {
  const report = await inspectMetro(state)
  if (report.ok) return report
  console.error(JSON.stringify(report, null, 2))
  die(
    `Metro at ${state.baseUrl} is not up or not answering. ` +
      `Problems: ${report.problems.join('; ')}. ` +
      'Relaunch with `helpers/control launch`, or inspect with `helpers/control doctor`.',
    EXIT_NOT_DRIVABLE,
  )
}

async function cmdDoctor() {
  const state = requireState()
  const report = await inspectMetro(state)
  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) process.exit(EXIT_NOT_DRIVABLE)
}

const DRIVES = {
  welcome: {
    test: 'src/welcome.test.tsx',
    identity: 'data',
    fail: 'welcome screen drive failed — the RNTL render did not show Coffee Companion',
    required: ['Coffee Companion', 'welcome-screen', 'Sign Out'],
    observed: {
      heading: 'Coffee Companion',
      testID: 'welcome-screen',
      headingTestID: 'welcome-heading',
      accessibilityLabel: 'Welcome',
      headingRole: 'header',
      signOut: 'Sign Out',
    },
  },
  'sign-in': {
    test: 'src/auth/sign-in.test.tsx',
    identity: 'public',
    fail: 'sign-in screen drive failed — the RNTL render did not show Sign in',
    required: [
      'Coffee Companion',
      'Sign in',
      'Sign in with Google',
      "Don't have an account?",
    ],
    observed: {
      heading: 'Sign in',
      brand: 'Coffee Companion',
      testID: 'sign-in-screen',
      headingTestID: 'sign-in-heading',
      accessibilityLabel: 'Sign in',
      google: 'Sign in with Google',
      apple: 'Sign in with Apple',
      noAccount: "Don't have an account? Sign up",
    },
  },
}

async function cmdDrive(feature) {
  const recipe = DRIVES[feature]
  if (!recipe) {
    die(
      `Only \`drive welcome\` and \`drive sign-in\` are implemented as one-shot recipes. ` +
        `${feature ? `"${feature}"` : 'That feature'} is mapped under features/ — drive it from its file. ` +
        `Do not treat a missing drive stub as verification.`,
    )
  }

  const state = requireState()
  await requireDrivableMetro(state)
  const dest = join(artifactsDir, state.runId, feature)
  ensureDir(dest)

  const test = run(
    'pnpm',
    ['--filter', '@coffee-companion/mobile', 'exec', 'jest', '--ci', recipe.test],
    {
      cwd: repoRoot,
      env: { VERIFY_MOBILE_ARTIFACTS: dest },
    },
  )
  if (test.status !== 0) {
    die(recipe.fail)
  }

  const treePath = join(dest, 'tree.txt')
  const treeJsonPath = join(dest, 'tree.json')
  if (!existsSync(treePath) || !existsSync(treeJsonPath)) {
    die(`Drive did not write ${treePath} and ${treeJsonPath}`)
  }

  const tree = readFileSync(treePath, 'utf8')
  for (const marker of recipe.required) {
    if (!tree.includes(marker)) {
      die(`${feature} tree dump does not mention ${marker}`)
    }
  }

  const proof = {
    feature,
    runId: state.runId,
    baseUrl: state.baseUrl,
    harness: 'rntl',
    identity: recipe.identity,
    platformsDriven: [],
    capturedAt: new Date().toISOString(),
    artifacts: [treePath, treeJsonPath, join(dest, 'proof.json')],
    observed: recipe.observed,
    note:
      'In-process React Native Testing Library render. No iOS simulator or Android emulator was attached. Native Google and Apple sheets were not presented.',
  }
  writeFileSync(join(dest, 'proof.json'), `${JSON.stringify(proof, null, 2)}\n`)
  console.log(JSON.stringify({ ok: true, ...proof }, null, 2))
}

function cmdCleanup() {
  const state = readState()
  const stopped = []
  const pids = new Set()
  if (state?.metroPid) pids.add(state.metroPid)
  for (const pid of state?.metroPids ?? []) pids.add(pid)
  for (const pid of pids) {
    stopRecordedPid(pid, 'metro', stopped)
  }

  if (existsSync(runDir)) {
    rmSync(runDir, { recursive: true, force: true })
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        stopped,
        retained: artifactsDir,
        note: 'Proof artifacts under artifacts/ survive cleanup. Scratch state under .run/ does not.',
      },
      null,
      2,
    ),
  )
}

function usage() {
  console.log(`Usage: helpers/control <launch|doctor|drive|cleanup>

  launch           Start Expo Metro on VERIFY_METRO_PORT (default 8081)
  doctor           Read-only check that this Metro is worth driving
  drive welcome    Render the signed-in welcome screen with React Native Testing Library
  drive sign-in    Render the signed-out sign-in screen with React Native Testing Library
  cleanup          Stop the recorded Metro pid; keep artifacts/

`)
}

export {
  isMetroReady,
  bundleHasAppMarker,
  fetchAppBundle,
  inspectMetro,
  METRO_READY_MARKER,
  APP_MARKER,
}

const invokedAsCli =
  Boolean(process.argv[1]) &&
  resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])

if (invokedAsCli) {
  const argv = process.argv.slice(2)
  const [command, ...rest] = argv
  switch (command) {
    case 'launch':
      await cmdLaunch()
      break
    case 'doctor':
      await cmdDoctor()
      break
    case 'drive':
      await cmdDrive(rest[0])
      break
    case 'cleanup':
      cmdCleanup()
      break
    case '-h':
    case '--help':
    case undefined:
      usage()
      break
    default:
      die(`Unknown command "${command}"`)
  }
}
