#!/usr/bin/env node
// Control CLI for Coffee Companion mobile verification. See SKILL.md.

import { spawn, spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
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
const HARNESS_RNTL = 'rntl'
const HARNESS_MAESTRO = 'maestro'
const AVD_NAME = 'verify-pixel'
const DEFAULT_DEVICE_WEB_PORT = 3910
const DEVICE_SERIAL = 'emulator-5554'
const EMULATOR_CONSOLE_PORT = 5554
const ANDROID_PACKAGE = 'dev.offbyonelabs.coffeecompanion'
const E2E_USER_ENV = 'EXPO_PUBLIC_E2E_USER'
const E2E_USER_WITH_DATA = 'e2e-user-with-data'
const GIT_SHORT_SHA_DIGITS = 7
const EMULATOR_BOOT_TIMEOUT_MS = 300_000
const EMULATOR_LOG_TAIL_LINES = 40
const EXPO_LOG_TAIL_LINES = 40
const BOOT_PROGRESS_INTERVAL_MS = 15_000
const INSTALL_PROGRESS_INTERVAL_MS = 15_000
const EXPO_INSTALL_TIMEOUT_MS = 900_000
const WEB_CONTROL = join(
  repoRoot,
  '.cursor/skills/verify-coffee-companion/helpers/control',
)
const WEB_STATE_PATH = join(
  repoRoot,
  '.cursor/skills/verify-coffee-companion/.run/state.json',
)

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

function missingStateMessage() {
  return (
    'No verification instance is recorded. ' +
    'Run `helpers/control launch` (RNTL) or `helpers/control launch-device` (device tier) first.'
  )
}

function requireState() {
  const state = readState()
  if (!state) {
    die(missingStateMessage())
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

function sdkRoot() {
  return process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? ''
}

function emulatorBin() {
  const root = sdkRoot()
  return root ? join(root, 'emulator', 'emulator') : 'emulator'
}

function adbBin() {
  const root = sdkRoot()
  return root ? join(root, 'platform-tools', 'adb') : 'adb'
}

function parseAdbDevices(text) {
  const devices = []
  for (const line of `${text ?? ''}`.split('\n')) {
    const match = line.match(/^(\S+)\s+(device|offline|unauthorized|bootloader)\s*$/)
    if (match) devices.push({ serial: match[1], state: match[2] })
  }
  return devices
}

function parseDumpsysVersionName(text) {
  const match = `${text ?? ''}`.match(/versionName=(\S+)/)
  return match ? match[1] : null
}

function parseAvdName(text) {
  const line = `${text ?? ''}`.trim().split('\n')[0] ?? ''
  return line.trim() || null
}

function parseEmulatorAvdList(text) {
  const names = []
  for (const line of `${text ?? ''}`.split('\n')) {
    const name = line.trim()
    if (!name) continue
    // emulator -list-avds can mix INFO/WARNING log lines with the name list
    if (name.includes('|')) continue
    names.push(name)
  }
  return names
}

function chosenAvdName(env = process.env) {
  const override = `${env?.VERIFY_AVD ?? ''}`.trim()
  return override || AVD_NAME
}

function missingAvdError(wanted, available) {
  const listed = available.length > 0 ? available.join(', ') : '(none)'
  return (
    `AVD ${wanted} is not installed. Available AVDs: ${listed}. ` +
    `Set VERIFY_AVD to one of those names, or create ${wanted}.`
  )
}

function requireAvd(wanted, available) {
  if (available.includes(wanted)) return wanted
  throw new Error(missingAvdError(wanted, available))
}

function tailText(text, lineCount) {
  const lines = `${text ?? ''}`.replace(/\s+$/, '').split('\n')
  if (lines.length === 1 && lines[0] === '') return ''
  return lines.slice(-lineCount).join('\n')
}

function emulatorDiedError(logText) {
  const tail = tailText(logText, EMULATOR_LOG_TAIL_LINES)
  if (!tail) {
    return 'Emulator process exited before boot completed. emulator.log is empty.'
  }
  return `Emulator process exited before boot completed. Tail of emulator.log:\n${tail}`
}

function bootWaitTick({ alive, bootCompleted, logText }) {
  if (bootCompleted) return { status: 'ok' }
  if (!alive) return { status: 'error', error: emulatorDiedError(logText) }
  return { status: 'wait' }
}

function expoAndroidArgs(avdName) {
  // Expo 57 --device matches device.name (the AVD), not the adb serial.
  return [
    '--filter',
    '@coffee-companion/mobile',
    'exec',
    'expo',
    'run:android',
    '--device',
    avdName,
  ]
}

function expoDiedError(logText) {
  const tail = tailText(logText, EXPO_LOG_TAIL_LINES)
  if (!tail) {
    return 'expo run:android exited before the APK was installed. expo-android.log is empty.'
  }
  return `expo run:android exited before the APK was installed. Tail of expo-android.log:\n${tail}`
}

function installWaitTick({ alive, versionName, logText }) {
  if (versionName) return { status: 'ok' }
  if (!alive) return { status: 'error', error: expoDiedError(logText) }
  return { status: 'wait' }
}

function listInstalledAvds() {
  const result = runCapture(emulatorBin(), ['-list-avds'], { allowFail: true })
  return parseEmulatorAvdList(`${result.stdout ?? ''}\n${result.stderr ?? ''}`)
}

function chosenDeviceWebPort(env = process.env) {
  const raw = `${env?.VERIFY_PORT ?? ''}`.trim()
  if (!raw) return DEFAULT_DEVICE_WEB_PORT
  const port = Number(raw)
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`VERIFY_PORT must be a positive integer, got ${raw}`)
  }
  return port
}

function deviceApiUrl(port) {
  // localhost so apps/mobile/src/auth/config.ts rewrites it to 10.0.2.2
  return `http://localhost:${port}`
}

function deviceExpoPublicEnv(port) {
  return {
    EXPO_PUBLIC_API_URL: deviceApiUrl(port),
    [E2E_USER_ENV]: E2E_USER_WITH_DATA,
  }
}

function webLaunchEnv(port) {
  const baseUrl = `http://127.0.0.1:${port}`
  return {
    VERIFY_PORT: String(port),
    BETTER_AUTH_URL: baseUrl,
    SITE_URL: baseUrl,
  }
}

function webDoctorUrl(state) {
  if (state?.webBaseUrl) return state.webBaseUrl
  if (state?.webPort) return `http://127.0.0.1:${state.webPort}`
  return null
}

function gitHeadShortSha() {
  const result = runCapture('git', [
    'rev-parse',
    `--short=${GIT_SHORT_SHA_DIGITS}`,
    'HEAD',
  ])
  return `${result.stdout ?? ''}`.trim()
}

function recordedPids(state) {
  const pids = new Set()
  if (!state) return pids
  for (const key of ['metroPid', 'emulatorPid', 'webPid', 'expoPid']) {
    if (state[key]) pids.add(state[key])
  }
  for (const pid of state.metroPids ?? []) pids.add(pid)
  return pids
}

function hasLiveRecordedPids(state) {
  for (const pid of recordedPids(state)) {
    if (pidAlive(pid)) return true
  }
  return false
}

function adbDevices() {
  const result = runCapture(adbBin(), ['devices'], { allowFail: true })
  return parseAdbDevices(`${result.stdout ?? ''}\n${result.stderr ?? ''}`)
}

function refuseIfSerialBusy(serial) {
  const found = adbDevices().find((device) => device.serial === serial)
  if (!found) return
  die(
    `${serial} is already in use (state ${found.state}). ` +
      `Do not attach to someone else's emulator. Stop that AVD, or use a different serial.`,
  )
}

function installedVersionName(serial, pkg) {
  const result = runCapture(
    adbBin(),
    ['-s', serial, 'shell', 'dumpsys', 'package', pkg],
    { allowFail: true },
  )
  return parseDumpsysVersionName(`${result.stdout ?? ''}\n${result.stderr ?? ''}`)
}

function copyPngFiles(fromDir, destDir) {
  if (!existsSync(fromDir)) return []
  const copied = []
  for (const name of readdirSync(fromDir)) {
    if (!name.endsWith('.png')) continue
    const from = join(fromDir, name)
    const to = join(destDir, name)
    if (from !== to) copyFileSync(from, to)
    copied.push(to)
  }
  return copied
}

function collectPngFiles(dir) {
  if (!existsSync(dir)) return []
  const found = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...collectPngFiles(path))
    else if (entry.name.endsWith('.png')) found.push(path)
  }
  return found
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
  if (hasLiveRecordedPids(existing)) {
    die(
      `A verification instance is already running (pid ${existing.metroPid ?? existing.expoPid} at ${existing.baseUrl ?? existing.serial}). ` +
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
      harness: HARNESS_RNTL,
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
          harness: HARNESS_RNTL,
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

function spawnLogged(command, args, logPath, opts = {}) {
  const logFd = openSync(logPath, 'w')
  const child = spawn(command, args, {
    cwd: opts.cwd ?? repoRoot,
    env: { ...process.env, ...opts.env },
    stdio: ['ignore', logFd, logFd],
    detached: true,
  })
  child.unref()
  return child
}

async function waitForBootCompleted(serial, timeoutMs, opts = {}) {
  const start = Date.now()
  let lastProgressAt = 0
  while (Date.now() - start < timeoutMs) {
    const now = Date.now()
    if (now - lastProgressAt >= BOOT_PROGRESS_INTERVAL_MS) {
      console.error(
        `booting ${serial}… ${Math.floor((now - start) / 1000)}s elapsed`,
      )
      lastProgressAt = now
    }
    const result = runCapture(
      adbBin(),
      ['-s', serial, 'shell', 'getprop', 'sys.boot_completed'],
      { allowFail: true },
    )
    const bootCompleted = `${result.stdout ?? ''}`.trim() === '1'
    const alive = opts.pid == null ? true : pidAlive(opts.pid)
    const logText =
      opts.logPath && existsSync(opts.logPath)
        ? readFileSync(opts.logPath, 'utf8')
        : ''
    const tick = bootWaitTick({ alive, bootCompleted, logText })
    if (tick.status === 'ok') return
    if (tick.status === 'error') throw new Error(tick.error)
    await sleep(1_000)
  }
  throw new Error(`Timed out waiting for ${serial} to finish booting`)
}

async function waitForInstalledPackage(serial, pkg, timeoutMs, opts = {}) {
  const start = Date.now()
  let lastProgressAt = 0
  while (Date.now() - start < timeoutMs) {
    const now = Date.now()
    if (now - lastProgressAt >= INSTALL_PROGRESS_INTERVAL_MS) {
      const logHint = opts.logPath ? ` See ${opts.logPath}` : ''
      console.error(`building/installing ${pkg} on ${serial}…${logHint}`)
      lastProgressAt = now
    }
    const versionName = installedVersionName(serial, pkg)
    const alive = opts.pid == null ? true : pidAlive(opts.pid)
    const logText =
      opts.logPath && existsSync(opts.logPath)
        ? readFileSync(opts.logPath, 'utf8')
        : ''
    const tick = installWaitTick({ alive, versionName, logText })
    if (tick.status === 'ok') return versionName
    if (tick.status === 'error') throw new Error(tick.error)
    await sleep(2_000)
  }
  throw new Error(`Timed out waiting for ${pkg} to install on ${serial}`)
}

function startWebApp(port) {
  run(WEB_CONTROL, ['launch'], { env: webLaunchEnv(port) })
  if (!existsSync(WEB_STATE_PATH)) {
    throw new Error(`Web launch did not write ${WEB_STATE_PATH}`)
  }
  const web = JSON.parse(readFileSync(WEB_STATE_PATH, 'utf8'))
  if (!web.serverPid || !web.baseUrl) {
    throw new Error('Web launch did not record a server pid and baseUrl')
  }
  if (web.port !== port) {
    throw new Error(`Web launch recorded port ${web.port}, expected ${port}`)
  }
  return {
    webPid: web.serverPid,
    webPort: web.port,
    webBaseUrl: web.baseUrl,
  }
}

function uninstallPackage(serial, pkg) {
  runCapture(adbBin(), ['-s', serial, 'uninstall', pkg], { allowFail: true })
}

function stopLaunchDevice(partial, stopped = []) {
  if (partial.expoPid) stopRecordedPid(partial.expoPid, 'expo', stopped)
  if (partial.serial && partial.androidPackage) {
    uninstallPackage(partial.serial, partial.androidPackage)
  }
  if (partial.emulatorPid) stopRecordedPid(partial.emulatorPid, 'emulator', stopped)
  if (partial.webPid) stopRecordedPid(partial.webPid, 'web', stopped)
}

async function cmdLaunchDevice() {
  const existing = readState()
  if (hasLiveRecordedPids(existing)) {
    die(
      `A verification instance is already running. ` +
        'Drive that one, or run `helpers/control cleanup` first. Do not double-drive.',
    )
  }

  const webPort = chosenDeviceWebPort()
  refuseIfPortBusy(DEFAULT_METRO_PORT)
  refuseIfPortBusy(webPort)
  refuseIfSerialBusy(DEVICE_SERIAL)

  const emu = emulatorBin()
  if (emu.includes('/') && !existsSync(emu)) {
    die(
      `Android emulator binary not found at ${emu}. ` +
        `launch-device needs the SDK and an AVD (default ${AVD_NAME}, override with VERIFY_AVD). ` +
        'This machine cannot run the device tier.',
    )
  }

  const avdName = chosenAvdName()
  try {
    requireAvd(avdName, listInstalledAvds())
  } catch (error) {
    die(error.message)
  }

  ensureDir(runDir)
  ensureDir(artifactsDir)

  if (!existsSync(join(repoRoot, 'node_modules'))) {
    console.error('Installing workspace dependencies…')
    run('pnpm', ['install', '--frozen-lockfile'])
  }

  const partial = {
    serial: DEVICE_SERIAL,
    androidPackage: ANDROID_PACKAGE,
    emulatorPid: null,
    webPid: null,
    expoPid: null,
  }

  try {
    const emulatorLog = join(runDir, 'emulator.log')
    const emulator = spawnLogged(
      emu,
      [
        '-avd',
        avdName,
        '-port',
        String(EMULATOR_CONSOLE_PORT),
        '-no-snapshot-save',
        '-no-boot-anim',
      ],
      emulatorLog,
    )
    partial.emulatorPid = emulator.pid
    await waitForBootCompleted(DEVICE_SERIAL, EMULATOR_BOOT_TIMEOUT_MS, {
      pid: emulator.pid,
      logPath: emulatorLog,
    })

    console.error(
      `Starting the web app on port ${webPort} with E2E_BYPASS_AUTH=true…`,
    )
    const web = startWebApp(webPort)
    partial.webPid = web.webPid

    const expoLog = join(runDir, 'expo-android.log')
    const expo = spawnLogged(
      'pnpm',
      expoAndroidArgs(avdName),
      expoLog,
      {
        cwd: repoRoot,
        env: {
          CI: '1',
          EXPO_NO_TELEMETRY: '1',
          ...deviceExpoPublicEnv(webPort),
        },
      },
    )
    partial.expoPid = expo.pid

    const versionName = await waitForInstalledPackage(
      DEVICE_SERIAL,
      ANDROID_PACKAGE,
      EXPO_INSTALL_TIMEOUT_MS,
      { logPath: expoLog, pid: expo.pid },
    )

    const state = {
      runId: `verify-${new Date().toISOString().replace(/[:.]/g, '-')}`,
      harness: HARNESS_MAESTRO,
      serial: DEVICE_SERIAL,
      avdName,
      androidPackage: ANDROID_PACKAGE,
      emulatorPid: emulator.pid,
      webPid: web.webPid,
      webPort: web.webPort,
      webBaseUrl: web.webBaseUrl,
      expoPid: expo.pid,
      gitHead: gitHeadShortSha(),
      versionName,
      logPath: expoLog,
      emulatorLog,
      startedAt: new Date().toISOString(),
    }
    writeState(state)

    console.log(
      JSON.stringify(
        {
          ok: true,
          runId: state.runId,
          harness: HARNESS_MAESTRO,
          serial: DEVICE_SERIAL,
          avdName,
          androidPackage: ANDROID_PACKAGE,
          emulatorPid: emulator.pid,
          webPid: web.webPid,
          webPort: web.webPort,
          webBaseUrl: web.webBaseUrl,
          expoPid: expo.pid,
          versionName,
          gitHead: state.gitHead,
          ready: `${ANDROID_PACKAGE} versionName ${versionName} on ${DEVICE_SERIAL}`,
        },
        null,
        2,
      ),
    )
  } catch (error) {
    stopLaunchDevice(partial)
    die(error.message)
  }
}

async function requireDrivableDevice(state) {
  if (!state.serial) {
    die(
      'No device is recorded. Run `helpers/control launch-device` first.',
      EXIT_NOT_DRIVABLE,
    )
  }
  const report = await inspectDevice(state)
  if (report.ok) return report
  console.error(JSON.stringify(report, null, 2))
  die(
    `Device ${state.serial} is not up or not the build under test. ` +
      `Problems: ${report.problems.join('; ')}.`,
    EXIT_NOT_DRIVABLE,
  )
}

async function cmdDriveDevice(flow) {
  if (!flow) {
    die('Usage: helpers/control drive-device <flow>')
  }
  const flowPath = join(skillDir, 'flows', `${flow}.yaml`)
  if (!existsSync(flowPath)) {
    die(
      `No Maestro flow at ${flowPath}. ` +
        'Do not treat a missing flow as verification.',
    )
  }

  const state = requireState()
  await requireDrivableDevice(state)
  const dest = join(artifactsDir, state.runId, flow)
  ensureDir(dest)
  const shotDir = join(runDir, 'maestro', flow)
  ensureDir(shotDir)

  const test = run(
    'maestro',
    [
      '--device',
      state.serial,
      'test',
      '--debug-output',
      dest,
      flowPath,
    ],
    { cwd: shotDir },
  )
  if (test.status !== 0) {
    die(`Maestro flow ${flow} failed`)
  }

  copyPngFiles(shotDir, dest)
  const uniqueShots = [...new Set(collectPngFiles(dest))]
  if (uniqueShots.length === 0) {
    die(`Drive did not copy any screenshots into ${dest}`)
  }

  const proof = {
    feature: flow,
    runId: state.runId,
    harness: HARNESS_MAESTRO,
    identity: 'data',
    serial: state.serial,
    avdName: state.avdName ?? AVD_NAME,
    androidPackage: state.androidPackage ?? ANDROID_PACKAGE,
    platformsDriven: ['android'],
    capturedAt: new Date().toISOString(),
    artifacts: [...uniqueShots, join(dest, 'proof.json')],
    observed: {
      testIDs: [
        'sign-in-screen',
        'e2e-sign-in',
        'welcome-screen',
        'sign-out',
      ],
    },
    note: `Maestro on ${state.serial} (${state.avdName ?? AVD_NAME}). Selectors are testIDs only.`,
  }
  writeFileSync(join(dest, 'proof.json'), `${JSON.stringify(proof, null, 2)}\n`)
  console.log(JSON.stringify({ ok: true, ...proof }, null, 2))
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
    harness: state.harness ?? HARNESS_RNTL,
    problems,
  }
}

async function inspectDevice(state, timeoutMs = DOCTOR_FETCH_TIMEOUT_MS) {
  const problems = []
  const serial = state.serial
  const pkg = state.androidPackage ?? ANDROID_PACKAGE
  const devices = adbDevices()
  const attached = devices.find((device) => device.serial === serial)

  if (!serial) {
    problems.push('no device serial is recorded')
  } else if (!attached) {
    problems.push(`${serial} is not attached`)
  } else if (attached.state !== 'device') {
    problems.push(`${serial} is ${attached.state}`)
  }

  if (state.emulatorPid && !pidAlive(state.emulatorPid)) {
    problems.push(`emulator pid ${state.emulatorPid} is not running`)
  }
  if (state.webPid && !pidAlive(state.webPid)) {
    problems.push(`web pid ${state.webPid} is not running`)
  }
  if (state.expoPid && !pidAlive(state.expoPid)) {
    problems.push(`expo pid ${state.expoPid} is not running`)
  }

  if (serial && attached?.state === 'device') {
    const avd = parseAvdName(
      runCapture(adbBin(), ['-s', serial, 'emu', 'avd', 'name'], {
        allowFail: true,
      }).stdout,
    )
    if (avd && avd !== (state.avdName ?? AVD_NAME)) {
      problems.push(`${serial} is AVD ${avd}, not ${state.avdName ?? AVD_NAME}`)
    }
  }

  const expectedSha = gitHeadShortSha()
  const versionName = serial ? installedVersionName(serial, pkg) : null
  if (!versionName) {
    problems.push(`could not read versionName for ${pkg} on ${serial}`)
  } else if (versionName !== expectedSha) {
    problems.push(
      `installed APK versionName ${versionName} does not match git HEAD ${expectedSha}`,
    )
  }

  const webUrl = webDoctorUrl(state)
  let webStatus = null
  if (!webUrl) {
    problems.push('no web base URL is recorded')
  } else {
    try {
      const response = await fetchText(webUrl, timeoutMs)
      webStatus = response.status
      if (webStatus < HTTP_OK_MIN || webStatus >= HTTP_OK_MAX) {
        problems.push(`GET ${webUrl} returned ${webStatus}`)
      }
    } catch (error) {
      problems.push(`GET ${webUrl} failed: ${error.message}`)
    }
  }

  return {
    ok: problems.length === 0,
    serial,
    avdName: state.avdName ?? AVD_NAME,
    androidPackage: pkg,
    versionName,
    gitHead: expectedSha,
    webPort: state.webPort,
    webBaseUrl: webUrl,
    webStatus,
    devices: devices.map((device) => device.serial),
    harness: HARNESS_MAESTRO,
    problems,
  }
}

async function inspectInstance(state) {
  const problems = []
  let metro = null
  let device = null
  if (state.metroPid || state.harness === HARNESS_RNTL) {
    metro = await inspectMetro(state)
    problems.push(...metro.problems)
  }
  if (state.serial) {
    device = await inspectDevice(state)
    problems.push(...device.problems)
  }
  return {
    ...(metro ?? {}),
    ...(device ?? {}),
    ok: problems.length === 0,
    harness: state.harness ?? (state.serial ? HARNESS_MAESTRO : HARNESS_RNTL),
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
  const report = await inspectInstance(state)
  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) process.exit(EXIT_NOT_DRIVABLE)
}

const DRIVES = {
  welcome: {
    test: 'src/welcome.test.tsx',
    identity: 'data',
    fail: 'welcome screen drive failed — the RNTL render did not show Coffee Companion',
    required: ['Coffee Companion', 'welcome-screen', 'sign-out'],
    observed: {
      heading: 'Coffee Companion',
      testID: 'welcome-screen',
      headingTestID: 'welcome-heading',
      accessibilityLabel: 'Welcome',
      headingRole: 'header',
      signOutTestID: 'sign-out',
    },
  },
  'sign-in': {
    test: 'src/auth/sign-in.test.tsx',
    identity: 'public',
    fail: 'sign-in screen drive failed — the RNTL render did not show Sign in',
    required: [
      'Coffee Companion',
      'Sign in',
      'sign-in-google',
      'sign-in-toggle',
    ],
    observed: {
      heading: 'Sign in',
      brand: 'Coffee Companion',
      testID: 'sign-in-screen',
      headingTestID: 'sign-in-heading',
      accessibilityLabel: 'Sign in',
      googleTestID: 'sign-in-google',
      appleTestID: 'sign-in-apple',
      toggleTestID: 'sign-in-toggle',
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

function pidKind(pid, state) {
  if (pid === state?.expoPid) return 'expo'
  if (pid === state?.webPid) return 'web'
  if (pid === state?.emulatorPid) return 'emulator'
  return 'metro'
}

function cmdCleanup() {
  const state = readState()
  const stopped = []
  if (state) {
    if (state.expoPid) stopRecordedPid(state.expoPid, 'expo', stopped)
    for (const pid of recordedPids(state)) {
      if (pid === state.expoPid) continue
      if (pid === state.emulatorPid || pid === state.webPid) continue
      stopRecordedPid(pid, pidKind(pid, state), stopped)
    }
    if (state.serial && state.androidPackage) {
      uninstallPackage(state.serial, state.androidPackage)
    }
    if (state.emulatorPid) stopRecordedPid(state.emulatorPid, 'emulator', stopped)
    if (state.webPid) stopRecordedPid(state.webPid, 'web', stopped)
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
  console.log(`Usage: helpers/control <launch|launch-device|doctor|drive|drive-device|cleanup>

  launch              Start Expo Metro on VERIFY_METRO_PORT (default 8081)
  launch-device       Boot AVD ${AVD_NAME} (or VERIFY_AVD) on ${DEVICE_SERIAL}, start the web app on VERIFY_PORT (default ${DEFAULT_DEVICE_WEB_PORT}), install the APK
  doctor              Read-only check that this instance is worth driving
  drive welcome       Render the signed-in welcome screen with React Native Testing Library
  drive sign-in       Render the signed-out sign-in screen with React Native Testing Library
  drive-device <flow> Run Maestro flows/<flow>.yaml on ${DEVICE_SERIAL}
  cleanup             Stop recorded pids and uninstall the package from that serial; keep artifacts/

`)
}

export {
  isMetroReady,
  bundleHasAppMarker,
  fetchAppBundle,
  inspectMetro,
  parseAdbDevices,
  parseDumpsysVersionName,
  parseAvdName,
  parseEmulatorAvdList,
  chosenAvdName,
  requireAvd,
  bootWaitTick,
  expoAndroidArgs,
  installWaitTick,
  chosenDeviceWebPort,
  deviceApiUrl,
  deviceExpoPublicEnv,
  webLaunchEnv,
  missingStateMessage,
  recordedPids,
  copyPngFiles,
  collectPngFiles,
  METRO_READY_MARKER,
  APP_MARKER,
  AVD_NAME,
  DEFAULT_DEVICE_WEB_PORT,
  DEVICE_SERIAL,
  ANDROID_PACKAGE,
  E2E_USER_WITH_DATA,
  HARNESS_MAESTRO,
  HARNESS_RNTL,
  GIT_SHORT_SHA_DIGITS,
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
    case 'launch-device':
      await cmdLaunchDevice()
      break
    case 'doctor':
      await cmdDoctor()
      break
    case 'drive':
      await cmdDrive(rest[0])
      break
    case 'drive-device':
      await cmdDriveDevice(rest[0])
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
