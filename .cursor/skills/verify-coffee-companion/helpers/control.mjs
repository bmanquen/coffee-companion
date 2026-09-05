#!/usr/bin/env node
// Control CLI for Coffee Companion verification. See SKILL.md for invocation.
// Agents drive the real web UI through Playwright — the same harness as
// apps/web/e2e — against a disposable test-database instance.

import { randomBytes } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import {
  createConnection,
  createServer,
} from 'node:net'
import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'

const here = dirname(fileURLToPath(import.meta.url))
const skillDir = resolve(here, '..')
const repoRoot = process.env.VERIFY_REPO_ROOT ?? resolve(skillDir, '../../..')
const runDir = join(skillDir, '.run')
const statePath = join(runDir, 'state.json')
const artifactsDir = join(skillDir, 'artifacts')
const webDir = join(repoRoot, 'apps/web')

const DEFAULT_PORT = Number(process.env.VERIFY_PORT ?? 3000)
const BROWSER_PORT = Number(process.env.VERIFY_BROWSER_PORT ?? 3939)
const IDENTITIES = {
  public: null,
  data: 'e2e-user-with-data',
  empty: 'e2e-user-empty',
  free: 'e2e-user-free',
}

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
  writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n')
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

async function waitForHttp(url, timeoutMs = 60_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, { redirect: 'manual' })
      if (response.status > 0) return response.status
    } catch {
      // still booting
    }
    await sleep(250)
  }
  die(`Timed out waiting for ${url}`)
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
      'Do not drive a shared instance — that is likely `pnpm dev` on the development database. ' +
      'Stop that process, or set VERIFY_PORT to a free port and launch a dedicated instance.',
  )
}

function placeholderEnv(port) {
  return {
    BETTER_AUTH_SECRET:
      process.env.BETTER_AUTH_SECRET ?? randomBytes(32).toString('hex'),
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? `http://127.0.0.1:${port}`,
    GOOGLE_CLIENT_ID:
      process.env.GOOGLE_CLIENT_ID ?? `verify-${randomBytes(8).toString('hex')}`,
    GOOGLE_CLIENT_SECRET:
      process.env.GOOGLE_CLIENT_SECRET ?? randomBytes(32).toString('hex'),
    SITE_URL: process.env.SITE_URL ?? `http://127.0.0.1:${port}`,
  }
}

async function cmdLaunch() {
  const existing = readState()
  if (existing?.serverPid && pidAlive(existing.serverPid)) {
    die(
      `A verification instance is already running (pid ${existing.serverPid} at ${existing.baseUrl}). ` +
        'Drive that one, or run `helpers/control cleanup` first. Do not double-drive.',
    )
  }

  const port = DEFAULT_PORT
  refuseIfPortBusy(port)

  ensureDir(runDir)
  ensureDir(artifactsDir)

  if (!existsSync(join(repoRoot, 'node_modules'))) {
    console.error('Installing workspace dependencies…')
    run('pnpm', ['install', '--frozen-lockfile'])
  }

  const playwrightBrowsers = join(
    process.env.HOME ?? '/tmp',
    '.cache/ms-playwright',
  )
  if (!existsSync(playwrightBrowsers)) {
    console.error('Installing Playwright Chromium…')
    run('pnpm', ['--filter', 'coffee-companion', 'exec', 'playwright', 'install', 'chromium'])
  }

  const urlFile = join(runDir, 'database.url')
  const pg = runCapture('bash', [join(here, 'ensure-postgres.sh')], {
    env: { VERIFY_DB_URL_FILE: urlFile },
  })
  if (pg.status !== 0) {
    die(pg.stderr || 'ensure-postgres.sh failed')
  }
  if (!existsSync(urlFile)) {
    die(
      `ensure-postgres.sh did not write ${urlFile} (stdout: ${(pg.stdout ?? '').trim()})`,
    )
  }
  const databaseUrl = readFileSync(urlFile, 'utf8').trim()
  if (!databaseUrl.startsWith('postgres')) {
    die('ensure-postgres.sh wrote an unusable DATABASE_URL file')
  }
  assertLocalTestDatabase(databaseUrl)

  const env = {
    ...placeholderEnv(port),
    DATABASE_URL: databaseUrl,
    PORT: String(port),
    E2E_BYPASS_AUTH: 'true',
  }

  console.error('Applying migrations…')
  run('pnpm', ['db:migrate'], { env })

  console.error('Seeding e2e bypass users…')
  run(
    'pnpm',
    ['--filter', 'coffee-companion', 'exec', 'tsx', join(here, 'seed.mjs')],
    { env, cwd: repoRoot },
  )

  // Always rebuild. An existence-only check would serve a stale .output after
  // a branch switch or source edit and invalidate the proof. The production
  // build is ~15s here; correctness beats reuse.
  const serverEntry = join(webDir, '.output/server/index.mjs')
  console.error('Building the production web app…')
  run('pnpm', ['--filter', 'coffee-companion', 'build'], { env })
  if (!existsSync(serverEntry)) {
    die(`Build did not produce ${serverEntry}`)
  }

  const logPath = join(runDir, 'server.log')
  const logFd = openSync(logPath, 'w')
  const server = spawn('node', [serverEntry], {
    cwd: webDir,
    env: { ...process.env, ...env },
    stdio: ['ignore', logFd, logFd],
    detached: true,
  })
  server.unref()

  const baseUrl = `http://127.0.0.1:${port}`
  await waitForHttp(baseUrl, 120_000)

  const state = {
    runId: `verify-${new Date().toISOString().replace(/[:.]/g, '-')}`,
    serverPid: server.pid,
    port,
    baseUrl,
    databaseUrl,
    identity: 'public',
    browserPort: BROWSER_PORT,
    browserPid: null,
    logPath,
    startedAt: new Date().toISOString(),
  }
  writeState(state)

  console.log(
    JSON.stringify(
      {
        ok: true,
        runId: state.runId,
        baseUrl,
        serverPid: server.pid,
        database: databaseName(databaseUrl),
        ready: `GET ${baseUrl} answered`,
      },
      null,
      2,
    ),
  )
}

function databaseName(url) {
  try {
    return new URL(url).pathname.slice(1)
  } catch {
    return url
  }
}

// Same rule as packages/api/test/database.ts isLocalTestDatabase. Node reports
// IPv6 hostnames without brackets, so ::1 and [::1] both count as loopback.
function assertLocalTestDatabase(urlString) {
  let url
  try {
    url = new URL(urlString)
  } catch {
    die('DATABASE_URL is not a usable URL')
  }
  const host = url.hostname
  const name = decodeURIComponent(url.pathname.replace(/^\//, '').split('/')[0] ?? '')
  const loopback = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)
  if (!loopback || !name.endsWith('_test')) {
    die(
      `Refusing to launch: host must be loopback and the database name must end with _test (got ${host}/${name}).`,
    )
  }
}

async function cmdDoctor() {
  const state = requireState()
  const problems = []

  if (!pidAlive(state.serverPid)) {
    problems.push(`server pid ${state.serverPid} is not running`)
  }

  const listeners = portListenerPids(state.port)
  if (listeners.length === 0) {
    problems.push(`nothing is listening on port ${state.port}`)
  } else if (state.serverPid && !listeners.includes(state.serverPid)) {
    problems.push(
      `port ${state.port} is owned by pid(s) ${listeners.join(', ')}, not the launched server ${state.serverPid}`,
    )
  }

  let status = null
  let titleHint = null
  try {
    const response = await fetch(state.baseUrl, { redirect: 'manual' })
    status = response.status
    const body = await response.text()
    titleHint = /Coffee Companion/i.test(body)
    if (status < 200 || status >= 400) {
      problems.push(`GET ${state.baseUrl} returned ${status}`)
    }
    if (!titleHint) {
      problems.push(`GET ${state.baseUrl} body does not mention Coffee Companion`)
    }
  } catch (error) {
    problems.push(`GET ${state.baseUrl} failed: ${error.message}`)
  }

  const report = {
    ok: problems.length === 0,
    baseUrl: state.baseUrl,
    serverPid: state.serverPid,
    port: state.port,
    portOwners: listeners,
    database: databaseName(state.databaseUrl),
    identity: state.identity,
    httpStatus: status,
    appMarker: titleHint ? 'Coffee Companion' : null,
    e2eBypass: true,
    problems,
  }

  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) process.exit(2)
}

async function cmdSeed() {
  const state = requireState()
  run(
    'pnpm',
    ['--filter', 'coffee-companion', 'exec', 'tsx', join(here, 'seed.mjs')],
    {
      env: {
        ...placeholderEnv(state.port),
        DATABASE_URL: state.databaseUrl,
        E2E_BYPASS_AUTH: 'true',
      },
      cwd: repoRoot,
    },
  )
  console.log(JSON.stringify({ ok: true, seeded: ['data', 'free'] }, null, 2))
}

function sendDaemon(payload, timeoutMs = 60_000) {
  return new Promise((resolvePromise, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port: BROWSER_PORT })
    let buffer = ''
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error(`browser daemon timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8')
      const newline = buffer.indexOf('\n')
      if (newline !== -1) {
        clearTimeout(timer)
        socket.end()
        try {
          resolvePromise(JSON.parse(buffer.slice(0, newline)))
        } catch (error) {
          reject(error)
        }
      }
    })
    socket.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    socket.write(JSON.stringify(payload) + '\n')
  })
}

async function daemonUp(state) {
  try {
    const status = await sendDaemon({ op: 'status' }, 2000)
    if (status?.ok) return
  } catch {
    // start it
  }

  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--daemon'], {
    cwd: repoRoot,
    env: process.env,
    stdio: ['ignore', 'ignore', 'inherit'],
    detached: true,
  })
  child.unref()
  state.browserPid = child.pid
  writeState(state)

  const start = Date.now()
  while (Date.now() - start < 20_000) {
    try {
      const status = await sendDaemon({ op: 'status' }, 1000)
      if (status?.ok) return
    } catch {
      await sleep(150)
    }
  }
  die('Failed to start the Playwright browser daemon')
}

async function withDaemon(payload) {
  const state = requireState()
  await daemonUp(state)
  const result = await sendDaemon(payload)
  if (!result.ok) {
    die(result.error ?? JSON.stringify(result))
  }
  return result
}

function resolveArtifactPath(path) {
  if (!path) die('Missing --path')
  const resolved = isAbsolute(path) ? path : resolve(skillDir, path)
  ensureDir(dirname(resolved))
  return resolved
}

function parseArgs(argv) {
  const flags = {}
  const rest = []
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token.startsWith('--')) {
      const key = token.slice(2)
      const next = argv[i + 1]
      if (!next || next.startsWith('--')) {
        flags[key] = true
      } else {
        flags[key] = next
        i += 1
      }
    } else {
      rest.push(token)
    }
  }
  return { flags, rest }
}

async function cmdBrowser(argv) {
  const [action, ...raw] = argv
  if (!action) {
    die(
      'Usage: control browser <as|goto|click|fill|press|expect|screenshot|snapshot|status> …',
    )
  }
  const { flags } = parseArgs(raw)

  if (action === 'as') {
    const who = raw[0]
    if (!Object.hasOwn(IDENTITIES, who)) {
      die(`Unknown identity "${who}". Use public | data | empty | free.`)
    }
    const state = requireState()
    state.identity = who
    writeState(state)
    const result = await withDaemon({ op: 'as', user: who })
    console.log(JSON.stringify(result, null, 2))
    return
  }

  if (action === 'goto') {
    const path = flags.path ?? raw[0]
    if (!path) die('Usage: control browser goto --path /pricing')
    const result = await withDaemon({ op: 'goto', path })
    console.log(JSON.stringify(result, null, 2))
    return
  }

  if (action === 'click') {
    const result = await withDaemon({
      op: 'click',
      role: flags.role,
      name: flags.name,
      exact: Boolean(flags.exact),
      text: flags.text,
      first: Boolean(flags.first),
    })
    console.log(JSON.stringify(result, null, 2))
    return
  }

  if (action === 'fill') {
    const result = await withDaemon({
      op: 'fill',
      role: flags.role,
      name: flags.name,
      placeholder: flags.placeholder,
      value: flags.value,
      exact: Boolean(flags.exact),
    })
    console.log(JSON.stringify(result, null, 2))
    return
  }

  if (action === 'press') {
    const result = await withDaemon({ op: 'press', key: flags.key ?? raw[0] })
    console.log(JSON.stringify(result, null, 2))
    return
  }

  if (action === 'expect') {
    const result = await withDaemon({
      op: 'expect',
      role: flags.role,
      name: flags.name,
      text: flags.text,
      url: flags.url,
      count: flags.count !== undefined ? Number(flags.count) : undefined,
      exact: Boolean(flags.exact),
    })
    console.log(JSON.stringify(result, null, 2))
    return
  }

  if (action === 'screenshot') {
    const path = resolveArtifactPath(flags.path)
    const result = await withDaemon({ op: 'screenshot', path })
    console.log(JSON.stringify({ ...result, path }, null, 2))
    return
  }

  if (action === 'snapshot') {
    const path = resolveArtifactPath(flags.path)
    const result = await withDaemon({ op: 'snapshot', path, aria: true })
    console.log(JSON.stringify({ ...result, path }, null, 2))
    return
  }

  if (action === 'status') {
    const result = await withDaemon({ op: 'status' })
    console.log(JSON.stringify(result, null, 2))
    return
  }

  die(`Unknown browser action "${action}"`)
}

async function cmdDrive(feature) {
  if (feature !== 'marketing') {
    die(
      `Only \`drive marketing\` is implemented as a one-shot recipe. ` +
        `${feature ? `"${feature}"` : 'That feature'} is mapped under features/ — drive it with \`browser as\` / \`browser goto\` / \`browser click\` from its file. ` +
        `Do not treat a missing drive stub as verification.`,
    )
  }

  const state = requireState()
  const dest = join(artifactsDir, state.runId, 'marketing')
  ensureDir(dest)

  await withDaemon({ op: 'as', user: 'public' })
  await withDaemon({ op: 'goto', path: '/' })
  await withDaemon({
    op: 'expect',
    role: 'heading',
    name: 'Dial it in once. Never guess again.',
    exact: true,
  })
  await withDaemon({
    op: 'expect',
    role: 'button',
    name: '/save your first brew/i',
    first: true,
  })
  await withDaemon({ op: 'expect', role: 'table' })
  await withDaemon({ op: 'expect', text: 'Ethiopia Guji', first: true })
  await withDaemon({ op: 'screenshot', path: join(dest, 'home.png') })
  await withDaemon({ op: 'snapshot', path: join(dest, 'home.aria.txt') })

  await withDaemon({
    op: 'click',
    role: 'link',
    name: 'Pricing',
    nav: 'Marketing',
  })
  await withDaemon({
    op: 'expect',
    url: '/pricing$',
    role: 'heading',
    name: '/keep your history/i',
  })
  for (const plan of ['Free', 'Pro', 'Pro+']) {
    await withDaemon({
      op: 'expect',
      role: 'heading',
      name: plan,
      exact: true,
    })
  }
  await withDaemon({ op: 'expect', text: '$44.99' })
  await withDaemon({ op: 'click', role: 'button', name: 'Monthly', exact: true })
  await withDaemon({ op: 'expect', text: '$4.99' })
  await withDaemon({ op: 'screenshot', path: join(dest, 'pricing.png') })
  await withDaemon({ op: 'snapshot', path: join(dest, 'pricing.aria.txt') })

  const proof = {
    feature: 'marketing',
    runId: state.runId,
    baseUrl: state.baseUrl,
    identity: 'public',
    capturedAt: new Date().toISOString(),
    artifacts: [
      join(dest, 'home.png'),
      join(dest, 'home.aria.txt'),
      join(dest, 'pricing.png'),
      join(dest, 'pricing.aria.txt'),
    ],
    observed: {
      homeHeading: 'Dial it in once. Never guess again.',
      homeCta: 'Save your first brew — free',
      heroCoffee: 'Ethiopia Guji',
      pricingHeading: 'Keep your history',
      plans: ['Free', 'Pro', 'Pro+'],
      monthlyPrice: '$4.99',
    },
  }
  writeFileSync(join(dest, 'proof.json'), JSON.stringify(proof, null, 2) + '\n')
  console.log(JSON.stringify({ ok: true, ...proof }, null, 2))
}

function cmdCleanup() {
  const state = readState()
  const stopped = []

  if (state?.browserPid && pidAlive(state.browserPid)) {
    try {
      process.kill(state.browserPid, 'SIGTERM')
      stopped.push({ kind: 'browser-daemon', pid: state.browserPid })
    } catch {
      // already gone
    }
  }

  try {
    sendDaemon({ op: 'close' }, 1000).catch(() => {})
  } catch {
    // daemon not up
  }

  if (state?.serverPid && pidAlive(state.serverPid)) {
    try {
      process.kill(state.serverPid, 'SIGTERM')
      stopped.push({ kind: 'server', pid: state.serverPid })
    } catch {
      // already gone
    }
  }

  // Never kill by process name. If the recorded pid is gone, leave whatever
  // else is on the port alone — it was not started by this run.
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

function locatorFrom(page, spec) {
  if (spec.nav && spec.role) {
    return page
      .getByRole('navigation', { name: spec.nav })
      .getByRole(spec.role, { name: spec.name, exact: Boolean(spec.exact) })
  }
  if (spec.role) {
    let locator = page.getByRole(spec.role, {
      name: coerceName(spec.name),
      exact: Boolean(spec.exact),
    })
    if (spec.first) locator = locator.first()
    return locator
  }
  if (spec.placeholder) {
    return page.getByPlaceholder(spec.placeholder, { exact: Boolean(spec.exact) })
  }
  if (spec.text) {
    let locator = page.getByText(coerceName(spec.text), { exact: Boolean(spec.exact) })
    if (spec.first) locator = locator.first()
    return locator
  }
  throw new Error('Need --role/--name, --placeholder, or --text')
}

function coerceName(value) {
  if (value == null) return undefined
  if (value instanceof RegExp) return value
  if (typeof value === 'string' && value.startsWith('/') && value.endsWith('/i')) {
    return new RegExp(value.slice(1, -2), 'i')
  }
  if (typeof value === 'string' && value.startsWith('/') && value.endsWith('/')) {
    return new RegExp(value.slice(1, -1))
  }
  return value
}

async function runDaemon() {
  const { chromium } = await import(
    join(webDir, 'node_modules/@playwright/test/index.mjs')
  ).catch(async () => import('@playwright/test'))

  const state = requireState()
  const browser = await chromium.launch({ headless: true })
  let context = null
  let page = null
  let identity = state.identity ?? 'public'

  async function applyIdentity(next) {
    identity = next
    const userId = IDENTITIES[next]
    if (context) await context.close()
    context = await browser.newContext({
      baseURL: state.baseUrl,
      viewport: { width: 1280, height: 800 },
    })
    if (userId) {
      await context.addCookies([
        {
          name: 'e2e_auth',
          value: userId,
          domain: new URL(state.baseUrl).hostname,
          path: '/',
        },
      ])
    }
    page = await context.newPage()
    const recorded = readState()
    if (recorded) {
      recorded.identity = next
      writeState(recorded)
    }
  }

  await applyIdentity(identity)

  const server = createServer((socket) => {
    let buffer = ''
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8')
      const newline = buffer.indexOf('\n')
      if (newline === -1) return
      const line = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
      handle(JSON.parse(line))
        .then((result) => {
          socket.write(JSON.stringify({ ok: true, ...result }) + '\n')
        })
        .catch((error) => {
          socket.write(JSON.stringify({ ok: false, error: error.message }) + '\n')
        })
    })
  })

  async function handle(msg) {
    switch (msg.op) {
      case 'status':
        return {
          identity,
          url: page.url(),
          title: await page.title(),
        }
      case 'as':
        await applyIdentity(msg.user)
        return { identity: msg.user }
      case 'goto': {
        const response = await page.goto(msg.path, { waitUntil: 'domcontentloaded' })
        await page.waitForLoadState('networkidle').catch(() => {})
        return { url: page.url(), status: response?.status() ?? null }
      }
      case 'click': {
        const target = locatorFrom(page, msg)
        await target.waitFor({ state: 'visible', timeout: 15_000 })
        // First click after a navigation can land before hydration (see
        // apps/web/e2e/helpers.ts clickUntil). Retry the click itself.
        let lastError
        for (let attempt = 0; attempt < 5; attempt += 1) {
          try {
            await target.click({ timeout: 5_000 })
            lastError = null
            break
          } catch (error) {
            lastError = error
            await sleep(400)
          }
        }
        if (lastError) throw lastError
        return { url: page.url() }
      }
      case 'fill': {
        const target = locatorFrom(page, msg)
        await target.fill(String(msg.value ?? ''), { timeout: 15_000 })
        return { value: msg.value }
      }
      case 'press':
        await page.keyboard.press(msg.key)
        return { key: msg.key }
      case 'expect': {
        if (msg.url) {
          const pattern = new RegExp(msg.url)
          const start = Date.now()
          while (!pattern.test(new URL(page.url()).pathname + new URL(page.url()).search)) {
            if (Date.now() - start > 15_000) {
              throw new Error(`URL ${page.url()} did not match ${msg.url}`)
            }
            await sleep(100)
          }
        }
        if (msg.count !== undefined && (msg.role || msg.text)) {
          const target = locatorFrom(page, msg)
          const n = await target.count()
          if (n !== msg.count) {
            throw new Error(`expected count ${msg.count}, got ${n}`)
          }
          return { count: n, url: page.url() }
        }
        if (msg.role || msg.text || msg.placeholder) {
          const target = locatorFrom(page, msg)
          await target.waitFor({ state: 'visible', timeout: 15_000 })
        }
        return { url: page.url() }
      }
      case 'screenshot':
        ensureDir(dirname(msg.path))
        await page.screenshot({ path: msg.path, fullPage: true })
        return { path: msg.path, url: page.url() }
      case 'snapshot': {
        ensureDir(dirname(msg.path))
        const snapshot = await page.locator('body').ariaSnapshot()
        writeFileSync(msg.path, snapshot + '\n')
        return { path: msg.path, url: page.url() }
      }
      case 'close':
        setTimeout(() => {
          server.close()
          void browser.close().then(() => process.exit(0))
        }, 50)
        return { closing: true }
      default:
        throw new Error(`Unknown op ${msg.op}`)
    }
  }

  await new Promise((resolvePromise, reject) => {
    server.once('error', reject)
    server.listen(BROWSER_PORT, '127.0.0.1', resolvePromise)
  })
}

function usage() {
  console.log(`Usage: helpers/control <launch|doctor|seed|browser|drive|cleanup>

  launch                 Start Postgres (test DB), migrate, seed, build, serve
  doctor                 Read-only check that this instance is worth driving
  seed                   Reseed the e2e bypass users (data + free)
  browser as <who>       public | data | empty | free
  browser goto --path /
  browser click --role link --name Pricing
  browser fill --placeholder Name --value "Kenya Nyeri"
  browser press --key Enter
  browser expect --role heading --name Dashboard
  browser screenshot --path artifacts/foo.png
  browser snapshot --aria --path artifacts/foo.aria.txt
  drive marketing        One-shot recipe for the mapped marketing feature
  cleanup                Stop pids this run started; keep artifacts/

  Other mapped features (dashboard, coffees, brews, plans-and-shelf) have
  recipes in features/*.md but no drive <name> stub yet — use browser commands.

`)
}

const argv = process.argv.slice(2)
if (argv[0] === '--daemon') {
  await runDaemon()
} else {
  const [command, ...rest] = argv
  switch (command) {
    case 'launch':
      await cmdLaunch()
      break
    case 'doctor':
      await cmdDoctor()
      break
    case 'seed':
      await cmdSeed()
      break
    case 'browser':
      await cmdBrowser(rest)
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
