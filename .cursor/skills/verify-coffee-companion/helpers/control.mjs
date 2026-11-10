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

function requireTcpPort(raw, name, fallback) {
  const source =
    raw === undefined || raw === null || `${raw}`.trim() === ''
      ? fallback
      : `${raw}`.trim()
  const port = Number(source)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `${name} must be an integer from 1 to 65535, got "${raw ?? ''}".`,
    )
  }
  return port
}

function readTcpPortOrDie(raw, name, fallback) {
  try {
    return requireTcpPort(raw, name, fallback)
  } catch (error) {
    die(error instanceof Error ? error.message : String(error))
  }
}

const DEFAULT_PORT = readTcpPortOrDie(
  process.env.VERIFY_PORT,
  'VERIFY_PORT',
  3000,
)
const BROWSER_PORT = readTcpPortOrDie(
  process.env.VERIFY_BROWSER_PORT,
  'VERIFY_BROWSER_PORT',
  3939,
)
const IDENTITIES = {
  public: null,
  data: 'e2e-user-with-data',
  empty: 'e2e-user-empty',
  free: 'e2e-user-free',
  delete: 'e2e-user-delete',
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

function selectedOrigin(env) {
  const port = requireTcpPort(env.PORT, 'PORT', DEFAULT_PORT)
  return `http://127.0.0.1:${port}`
}

function webBuildEnv(env) {
  const origin = selectedOrigin(env)
  return {
    ...env,
    NODE_ENV: 'production',
    BETTER_AUTH_URL: origin,
    SITE_URL: origin,
  }
}

function webRuntimeEnv(env) {
  const origin = selectedOrigin(env)
  return {
    ...env,
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    NITRO_HOST: '127.0.0.1',
    // Always the selected port. A shell SITE_URL / BETTER_AUTH_URL would
    // otherwise bake marketing tags and the auth base URL for the wrong origin.
    BETTER_AUTH_URL: origin,
    SITE_URL: origin,
    // Empty, not omitted: a shell STRIPE_SECRET_KEY would otherwise enable
    // billing or crash launch on an incomplete Stripe config.
    STRIPE_SECRET_KEY: '',
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
  const origin = `http://127.0.0.1:${port}`
  return {
    BETTER_AUTH_SECRET:
      process.env.BETTER_AUTH_SECRET ?? randomBytes(32).toString('hex'),
    BETTER_AUTH_URL: origin,
    GOOGLE_CLIENT_ID:
      process.env.GOOGLE_CLIENT_ID ?? `verify-${randomBytes(8).toString('hex')}`,
    GOOGLE_CLIENT_SECRET:
      process.env.GOOGLE_CLIENT_SECRET ?? randomBytes(32).toString('hex'),
    SITE_URL: origin,
    STRIPE_SECRET_KEY: '',
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
  // build is ~15s here; correctness beats reuse. Pin NODE_ENV=production so a
  // shell NODE_ENV=test cannot leak into the Vite client bundle.
  const serverEntry = join(webDir, '.output/server/index.mjs')
  console.error('Building the production web app…')
  run('pnpm', ['--filter', 'coffee-companion', 'build'], {
    env: webBuildEnv(env),
  })
  if (!existsSync(serverEntry)) {
    die(`Build did not produce ${serverEntry}`)
  }

  const logPath = join(runDir, 'server.log')
  const logFd = openSync(logPath, 'w')
  const server = spawn('node', [serverEntry], {
    cwd: webDir,
    // Production *build* above; test *runtime* so the bypass guard can fire.
    // Pin loopback so Nitro does not inherit an unspecified HOST.
    env: { ...process.env, ...webRuntimeEnv(env) },
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
  console.log(JSON.stringify({ ok: true, seeded: ['data', 'free', 'delete'] }, null, 2))
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
      'Usage: control browser <as|goto|click|fill|press|expect|screenshot|snapshot|status|tab> …',
    )
  }
  const { flags } = parseArgs(raw)

  if (action === 'as') {
    const who = raw[0]
    if (!Object.hasOwn(IDENTITIES, who)) {
      die(`Unknown identity "${who}". Use public | data | empty | free | delete.`)
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
      label: flags.label,
      row: flags.row,
      nav: flags.nav,
      region: flags.region,
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
      label: flags.label,
      value: flags.value,
      exact: Boolean(flags.exact),
      row: flags.row,
      first: Boolean(flags.first),
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
    let innerText = flags['inner-text']
    if (flags['inner-text-file']) {
      const path = isAbsolute(flags['inner-text-file'])
        ? flags['inner-text-file']
        : resolve(skillDir, flags['inner-text-file'])
      innerText = readFileSync(path, 'utf8')
    }
    const result = await withDaemon({
      op: 'expect',
      role: flags.role,
      name: flags.name,
      text: flags.text,
      label: flags.label,
      row: flags.row,
      region: flags.region,
      url: flags.url,
      innerText,
      count: flags.count !== undefined ? Number(flags.count) : undefined,
      exact: Boolean(flags.exact),
      first: Boolean(flags.first),
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

  if (action === 'tab') {
    if (raw[0] === 'new') {
      const result = await withDaemon({ op: 'tab', action: 'new' })
      console.log(JSON.stringify(result, null, 2))
      return
    }
    const index = flags.index ?? raw[0]
    if (index === undefined || index === '') {
      die('Usage: control browser tab new | control browser tab --index 0')
    }
    const result = await withDaemon({ op: 'tab', index: Number(index) })
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

function regionFrom(page, spec) {
  const name = coerceName(spec.region)
  // Substring matching would accept a region named Apple Watch for Apple.
  return page.getByRole('region', {
    name,
    ...(typeof name === 'string' ? { exact: true } : {}),
  })
}

function locatorFrom(page, spec) {
  const root = spec.region ? regionFrom(page, spec) : page
  if (spec.nav && spec.role) {
    let locator = root
      .getByRole('navigation', { name: coerceName(spec.nav) })
      .getByRole(spec.role, {
        name: coerceName(spec.name),
        exact: Boolean(spec.exact),
      })
    if (spec.first) locator = locator.first()
    return locator
  }
  if (spec.row && spec.role) {
    let locator = root
      .getByRole('row', { name: coerceName(spec.row) })
      .getByRole(spec.role, {
        name: coerceName(spec.name),
        exact: Boolean(spec.exact),
      })
    if (spec.first) locator = locator.first()
    return locator
  }
  if (spec.role) {
    let locator = root.getByRole(spec.role, {
      name: coerceName(spec.name),
      exact: Boolean(spec.exact),
    })
    if (spec.first) locator = locator.first()
    return locator
  }
  if (spec.label) {
    let locator = root.getByLabel(coerceName(spec.label), {
      exact: Boolean(spec.exact),
    })
    if (spec.first) locator = locator.first()
    return locator
  }
  if (spec.placeholder) {
    let locator = root.getByPlaceholder(spec.placeholder, {
      exact: Boolean(spec.exact),
    })
    if (spec.first) locator = locator.first()
    return locator
  }
  if (spec.text) {
    let locator = root.getByText(coerceName(spec.text), {
      exact: Boolean(spec.exact),
    })
    if (spec.first) locator = locator.first()
    return locator
  }
  throw new Error('Need --role/--name, --label, --placeholder, or --text')
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

function assertOneRegion(count, name) {
  if (count !== 1) {
    throw new Error(
      `Region ${JSON.stringify(String(name))} matched ${count} times; expected 1. A missing or renamed region must not pass --count 0.`,
    )
  }
}

async function requireUniqueRegion(page, spec, { timeoutMs = 15_000 } = {}) {
  if (!spec.region) return
  const region = regionFrom(page, spec)
  const start = Date.now()
  let n = await region.count()
  while (n === 0 && Date.now() - start < timeoutMs) {
    await sleep(100)
    n = await region.count()
  }
  assertOneRegion(n, spec.region)
  if (timeoutMs > 0) {
    await region.waitFor({ state: 'visible', timeout: timeoutMs })
  }
}

// Two regions with the same name plus --first can click a descendant of the
// wrong one. Fail uniqueness before resolving the target.
async function resolveClickTarget(page, msg) {
  if (msg.region) await requireUniqueRegion(page, msg)
  return locatorFrom(page, msg)
}

async function runDaemon() {
  const { chromium } = await import(
    join(webDir, 'node_modules/@playwright/test/index.mjs')
  ).catch(async () => import('@playwright/test'))

  const state = requireState()
  const browser = await chromium.launch({ headless: true })
  let context = null
  let page = null
  let pages = []
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
    pages = [page]
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
          tab: pages.indexOf(page),
          tabs: pages.length,
        }
      case 'tab': {
        if (msg.action === 'new') {
          page = await context.newPage()
          pages.push(page)
          return { index: pages.length - 1, tabs: pages.length }
        }
        const index = Number(msg.index)
        if (!Number.isInteger(index) || index < 0 || index >= pages.length) {
          throw new Error(
            `No tab ${msg.index}. Open one with \`browser tab new\`; 0 is the first.`,
          )
        }
        page = pages[index]
        await page.bringToFront()
        return { index, tabs: pages.length, url: page.url() }
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
        const target = await resolveClickTarget(page, msg)
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
        await target.waitFor({ state: 'visible', timeout: 15_000 })
        // An unhydrated fill sets the DOM value and React never hears it
        // (apps/web/e2e/helpers.ts waitForHydration). Wait for React's
        // listener tag on the field and the layout outlet, then for that
        // outlet to finish commit, before typing.
        const start = Date.now()
        let hydrated = false
        while (Date.now() - start < 15_000) {
          hydrated = await target
            .evaluate((el) =>
              Object.keys(el).some((key) => key.startsWith('__reactProps$')),
            )
            .catch(() => false)
          if (hydrated) break
          await sleep(50)
        }
        if (!hydrated) {
          throw new Error(
            'React never tagged this node. If the page is interactive in a browser, the tag has been renamed.',
          )
        }
        const outletStart = Date.now()
        let outletTagged = false
        while (Date.now() - outletStart < 15_000) {
          outletTagged = await page
            .locator('main')
            .first()
            .evaluate((el) =>
              Object.keys(el).some((key) => key.startsWith('__reactProps$')),
            )
            .catch(() => false)
          if (outletTagged) break
          await sleep(50)
        }
        if (!outletTagged) {
          throw new Error(
            'React never tagged the page outlet. If the page is interactive in a browser, the tag has been renamed.',
          )
        }
        const outletIdleStart = Date.now()
        let outletIdle = false
        while (Date.now() - outletIdleStart < 15_000) {
          outletIdle = await page
            .locator('main')
            .first()
            .evaluate((el) => {
              // Same predicate as apps/web/e2e/helpers.ts isReactCommitIdle.
              const fiberKey = Object.keys(el).find((key) =>
                key.startsWith('__reactFiber$'),
              )
              if (!fiberKey) return false
              let fiber = el[fiberKey]
              if (!fiber) return false
              while (fiber.return) fiber = fiber.return
              if (fiber.tag !== 3) return false
              const root = fiber.stateNode
              if (!root) return false
              const current = root.current
              if (!current || current.tag !== 3) return false
              if (current !== fiber && current !== fiber.alternate) {
                return false
              }
              return root.pendingLanes === 0
            })
            .catch(() => false)
          if (outletIdle) break
          await sleep(50)
        }
        if (!outletIdle) {
          throw new Error(
            'React never committed the page outlet. If the page is interactive in a browser, the commit signal has changed.',
          )
        }
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
        if (msg.region) {
          await requireUniqueRegion(page, msg)
        }
        if (msg.innerText != null) {
          if (!msg.region) {
            throw new Error('Need --region with --inner-text')
          }
          const actual = (await regionFrom(page, msg).innerText()).replace(
            /\s+/g,
            ' ',
          ).trim()
          const expected = String(msg.innerText).replace(/\s+/g, ' ').trim()
          if (actual !== expected) {
            throw new Error('Region text did not match approved copy')
          }
          return { url: page.url() }
        }
        if (msg.count !== undefined && (msg.role || msg.text)) {
          const target = locatorFrom(page, msg)
          const n = await target.count()
          if (n !== msg.count) {
            throw new Error(`expected count ${msg.count}, got ${n}`)
          }
          return { count: n, url: page.url() }
        }
        if (msg.role || msg.text || msg.placeholder || msg.label) {
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
  seed                   Reseed the e2e bypass users (data + free + delete)
  browser as <who>       public | data | empty | free | delete
  browser goto --path /
  browser click --role link --name Pricing --nav Marketing
  browser click --role button --name "Edit grinder" --row "<unique>"
  browser fill --placeholder Name --value "Kenya Nyeri"
  browser fill --placeholder Name --value "Kenya Nyeri" --first
  browser fill --label "Dose (g)" --value 18
  browser press --key Enter
  browser expect --role heading --name Dashboard
  browser expect --text Standard --first
  browser expect --region Apple --inner-text-file features/privacy-apple.txt
  browser expect --url "[?&]method=espresso"
  browser screenshot --path artifacts/foo.png
  browser snapshot --aria --path artifacts/foo.aria.txt
  browser tab new        Open a second tab in this session (same cookie)
  browser tab --index 0  Switch to a tab (0 is the first; \`as\` resets tabs)
  drive marketing        One-shot recipe for the mapped marketing feature
  cleanup                Stop pids this run started; keep artifacts/

  Other mapped features (dashboard, coffees, brews, plans-and-shelf,
  equipment, privacy) have recipes in features/*.md but no drive <name>
  stub yet — use browser commands.

`)
}

export {
  locatorFrom,
  coerceName,
  assertOneRegion,
  requireUniqueRegion,
  resolveClickTarget,
  webBuildEnv,
  webRuntimeEnv,
  placeholderEnv,
  requireTcpPort,
}

// Importing this file for locator tests must not run launch/doctor/cleanup.
const invokedAsCli =
  Boolean(process.argv[1]) &&
  resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])

if (invokedAsCli) {
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
}
