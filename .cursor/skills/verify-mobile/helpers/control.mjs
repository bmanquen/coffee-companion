#!/usr/bin/env node
// Control CLI for Coffee Companion mobile verification. See SKILL.md.

import { spawn, spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  closeSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  writeSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { delimiter, dirname, extname, join, resolve } from 'node:path'
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
const VERIFY_APK_VERSION_ENV = 'VERIFY_APK_VERSION'
const APP_READY_TIMEOUT_MS = 60_000
const DEVICE_METRO_WAIT_MS = 60_000
const EMULATOR_GONE_TIMEOUT_MS = 60_000
const SERIAL_SETTLE_TIMEOUT_MS = 45_000
const SERIAL_STALE_KILL_AFTER_MS = 8_000
const SERIAL_POLL_MS = 1_000
const PORT_FREE_TIMEOUT_MS = 15_000
const PORT_FREE_POLL_MS = 500
const DEFAULT_VERIFY_DEVICE_FLOW = 'sign-in-and-out'
const SIGN_IN_TEST_ID = 'sign-in-screen'
const WELCOME_SCREEN_TEST_ID = 'welcome-screen'
const DEV_LAUNCHER_MARKERS = ['Development servers', 'npx expo start']
const DEV_MENU_ONBOARDING_MARKERS = ['This is the developer menu']
const DEV_MENU_CONTINUE_TEXT = 'Continue'
const DEV_MENU_MARKERS = ['Go home', 'Runtime version', 'Toggle performance monitor']
const DEV_MENU_CLOSE_TEXT = 'Close'
const DEV_CLIENT_DISABLE_AUTO_LAUNCH = 'disableAutoLaunch=1'
const DEV_CLIENT_DISABLE_ONBOARDING = 'disableOnboarding=1'
const AM_START_ALREADY_FOREGROUND =
  'Activity not started, intent has been delivered to currently running top-most instance'
const DEV_MENU_SHOWS_AT_LAUNCH_META = 'EXDevMenuShowsAtLaunch'
const DEV_MENU_ONBOARDING_FINISHED_META = 'EXDevMenuIsOnboardingFinished'
const SIGN_IN_VISIBLE_MARKERS = ['Sign in with Google', 'E2E sign in']
const DEVICE_FAILURE_SCREENSHOT = 'failure.png'
const DEVICE_FAILURE_DUMP = 'window_dump.xml'
const MAESTRO_LOG_NAME = 'maestro.log'
const MAESTRO_LOG_TAIL_LINES = 40
const APP_READY_PROGRESS_INTERVAL_MS = 15_000
const DEFAULT_MAC_EMULATOR_GPU = 'host'
const JAVA_MIN_MAJOR = 17
const JAVA_MAX_MAJOR = 21
const HOMEBREW_SDK_MARKER = 'android-commandlinetools'
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

function maestroLogPath(dest) {
  return join(dest, MAESTRO_LOG_NAME)
}

function maestroLogTail(text, lines = MAESTRO_LOG_TAIL_LINES) {
  const all = `${text ?? ''}`.replace(/\s+$/, '').split(/\r?\n/)
  return all.slice(-Math.max(1, lines)).join('\n')
}

function parseMaestroFailedStep(text) {
  const lines = `${text ?? ''}`.split(/\r?\n/).map((line) => line.trim())
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]
    if (!line) continue
    const marked = line.match(/^(?:❌|\[Failed\])\s*(.+)$/i)
    if (marked) {
      return marked[1].replace(/\s*❌\s*$/, '').trim()
    }
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]
    if (/Element not found|Assertion is false|Timed out/i.test(line)) {
      return line
    }
  }
  return null
}

function maestroFailureMessage({
  flow,
  dest,
  step,
  tail,
  screenshotPath,
  dumpPath,
}) {
  const lines = [`Maestro flow ${flow} failed.`]
  if (step) lines.push(`Failed step: ${step}`)
  if (tail) {
    lines.push('Maestro log tail:')
    lines.push(tail)
  }
  lines.push(
    `See ${maestroLogPath(dest)}` +
      `${screenshotPath ? `, ${screenshotPath}` : ''}` +
      `${dumpPath ? `, ${dumpPath}` : ''}.`,
  )
  return lines.join('\n')
}

function runTee(command, args, { logPath, cwd } = {}) {
  ensureDir(dirname(logPath))
  const fd = openSync(logPath, 'w')
  const chunks = []
  return new Promise((resolve) => {
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      try {
        closeSync(fd)
      } catch {
        // fd already closed
      }
      resolve(result)
    }
    const child = spawn(command, args, {
      cwd: cwd ?? repoRoot,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const onData = (out) => (chunk) => {
      chunks.push(chunk)
      try {
        writeSync(fd, chunk)
      } catch {
        // log fd closed
      }
      out.write(chunk)
    }
    child.stdout.on('data', onData(process.stdout))
    child.stderr.on('data', onData(process.stderr))
    child.on('error', (error) => {
      const message = Buffer.from(`${error.message}\n`)
      chunks.push(message)
      try {
        writeSync(fd, message)
      } catch {
        // log fd closed
      }
      finish({
        status: 1,
        stdout: Buffer.concat(chunks).toString('utf8'),
        error,
      })
    })
    child.on('close', (status) => {
      finish({
        status: status ?? 1,
        stdout: Buffer.concat(chunks).toString('utf8'),
      })
    })
  })
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

function portBusyMessage(port, pids, role = 'metro') {
  const pidList = pids.join(', ')
  if (role === 'web') {
    return (
      `Port ${port} is already in use (pids ${pidList}). ` +
      'That is the device-tier web app (VERIFY_PORT), not Metro. ' +
      'Stop that process, or set VERIFY_PORT to a free port and launch a dedicated instance.'
    )
  }
  return (
    `Port ${port} is already in use (pids ${pidList}). ` +
    'Do not drive a shared Metro — that is likely `pnpm --filter @coffee-companion/mobile start`. ' +
    'Stop that process, or set VERIFY_METRO_PORT to a free port and launch a dedicated instance.'
  )
}

function refuseIfPortBusy(port, role = 'metro') {
  const pids = portListenerPids(port)
  if (pids.length === 0) return
  die(portBusyMessage(port, pids, role))
}

function defaultStudioSdkRoot(home, platform) {
  if (platform === 'darwin') return join(home, 'Library', 'Android', 'sdk')
  return join(home, 'Android', 'Sdk')
}

function sdkLooksComplete(root, exists) {
  if (!root) return false
  // Homebrew android-commandlinetools can ship emulator/adb without the AVD images.
  if (`${root}`.includes(HOMEBREW_SDK_MARKER)) return false
  return (
    exists(join(root, 'emulator', 'emulator')) &&
    exists(join(root, 'platform-tools', 'adb')) &&
    exists(join(root, 'system-images'))
  )
}

function resolveSdkRoot(opts = {}) {
  const env = opts.env ?? process.env
  const home = opts.home ?? env.HOME ?? homedir()
  const platform = opts.platform ?? process.platform
  const exists = opts.exists ?? existsSync
  const candidates = [
    env.ANDROID_HOME,
    env.ANDROID_SDK_ROOT,
    defaultStudioSdkRoot(home, platform),
  ].filter(Boolean)
  for (const root of candidates) {
    if (sdkLooksComplete(root, exists)) return root
  }
  return null
}

function missingSdkError(home = process.env.HOME ?? homedir(), platform = process.platform) {
  const studio = defaultStudioSdkRoot(home, platform)
  return (
    `Android SDK not found. Set ANDROID_HOME to Android Studio's SDK (${studio}). ` +
    'Do not use Homebrew android-commandlinetools — that tree has no AVD system images. ' +
    'Create the AVD in Android Studio Device Manager.'
  )
}

function sdkRoot() {
  return resolveSdkRoot() ?? ''
}

function emulatorBin() {
  const root = sdkRoot()
  return root ? join(root, 'emulator', 'emulator') : 'emulator'
}

function adbBin() {
  const root = sdkRoot()
  return root ? join(root, 'platform-tools', 'adb') : 'adb'
}

function sdkChildEnv(root, extra = {}) {
  return {
    ANDROID_HOME: root,
    ANDROID_SDK_ROOT: root,
    PATH: [join(root, 'emulator'), join(root, 'platform-tools'), process.env.PATH]
      .filter(Boolean)
      .join(delimiter),
    ...extra,
  }
}

function chosenEmulatorGpu(env = process.env, platform = process.platform) {
  const override = `${env?.VERIFY_EMULATOR_GPU ?? ''}`.trim()
  if (override) return override
  if (platform === 'darwin') return DEFAULT_MAC_EMULATOR_GPU
  return null
}

function emulatorLaunchArgs(avdName, gpu) {
  const args = [
    '-avd',
    avdName,
    '-port',
    String(EMULATOR_CONSOLE_PORT),
    '-no-boot-anim',
  ]
  if (gpu) args.push('-gpu', gpu)
  return args
}

function parseJavaMajor(text) {
  const match = `${text ?? ''}`.match(/version "(\d+)(?:\.(\d+))?/)
  if (!match) return null
  const major = Number(match[1])
  if (major === 1 && match[2]) return Number(match[2])
  return Number.isInteger(major) ? major : null
}

function javaMajorAcceptable(major) {
  return (
    Number.isInteger(major) &&
    major >= JAVA_MIN_MAJOR &&
    major <= JAVA_MAX_MAJOR
  )
}

function readJavaVersionText(javaBin) {
  const result = runCapture(javaBin, ['-version'], { allowFail: true })
  return `${result.stderr ?? ''}\n${result.stdout ?? ''}`
}

function lookupMacJavaHome17() {
  const result = runCapture('/usr/libexec/java_home', ['-v', '17'], {
    allowFail: true,
  })
  if (result.status !== 0) return null
  return `${result.stdout ?? ''}`.trim() || null
}

function unsupportedJavaError(major, javaBin) {
  return (
    `Java ${major ?? 'unknown'} at ${javaBin} cannot compile the React Native Gradle plugin (needs ${JAVA_MIN_MAJOR}–${JAVA_MAX_MAJOR}). ` +
    'Install Temurin 17 (macOS: `brew install --cask temurin@17`) and set JAVA_HOME to that JDK, ' +
    'or run `/usr/libexec/java_home -v 17`.'
  )
}

function resolveGradleJava(opts = {}) {
  const env = opts.env ?? process.env
  const platform = opts.platform ?? process.platform
  const readJavaVersion = opts.readJavaVersion ?? readJavaVersionText
  const lookupMacJavaHome = opts.lookupMacJavaHome ?? lookupMacJavaHome17

  const javaHome = `${env.JAVA_HOME ?? ''}`.trim()
  const javaBin = javaHome ? join(javaHome, 'bin', 'java') : 'java'
  const major = parseJavaMajor(readJavaVersion(javaBin))
  if (javaMajorAcceptable(major)) {
    return { javaHome: javaHome || null, javaBin, major }
  }

  if (platform === 'darwin') {
    const home17 = `${lookupMacJavaHome() ?? ''}`.trim()
    if (home17) {
      return {
        javaHome: home17,
        javaBin: join(home17, 'bin', 'java'),
        major: JAVA_MIN_MAJOR,
      }
    }
  }

  throw new Error(unsupportedJavaError(major, javaBin))
}

function parseAdbDevices(text) {
  const devices = []
  for (const line of `${text ?? ''}`.split('\n')) {
    if (/list of devices/i.test(line)) continue
    const match = line.match(/^(\S+)\s+(\S+)\s*$/)
    if (match) devices.push({ serial: match[1], state: match[2] })
  }
  return devices
}

function serialWaitTick({ serial, devices = [] }) {
  const found = devices.find((device) => device.serial === serial)
  if (!found) return { status: 'gone' }
  if (found.state === 'device') return { status: 'device' }
  return { status: 'wait', state: found.state }
}

function adbEmuKillArgs(serial) {
  return ['-s', serial, 'emu', 'kill']
}

function portFreeTick(pids) {
  return pids.length === 0 ? { status: 'ok' } : { status: 'wait', pids }
}

function verifyDevicePlan(flow) {
  return {
    flow: `${flow ?? ''}`.trim() || DEFAULT_VERIFY_DEVICE_FLOW,
    steps: ['cleanup', 'launch-device', 'doctor', 'drive-device'],
    leaveUpOnFailure: true,
  }
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

function expoAndroidArgs(
  avdName,
  { rebuild = false, port = DEFAULT_METRO_PORT } = {},
) {
  // Expo 57 --device matches device.name (the AVD), not the adb serial.
  const args = [
    '--filter',
    '@coffee-companion/mobile',
    'exec',
    'expo',
    'run:android',
    '--device',
    avdName,
    '--port',
    String(port),
  ]
  if (rebuild) args.push('--no-build-cache')
  return args
}

function expoDiedError(logText) {
  const tail = tailText(logText, EXPO_LOG_TAIL_LINES)
  if (!tail) {
    return 'expo run:android exited before the APK was installed. expo-android.log is empty.'
  }
  return `expo run:android exited before the APK was installed. Tail of expo-android.log:\n${tail}`
}

function gradleBuildFinished(logText) {
  return /\bBUILD SUCCESSFUL\b/.test(`${logText ?? ''}`)
}

function installWaitReason({
  versionName,
  expectedVersion,
  buildFinished = false,
}) {
  if (!versionName) {
    return buildFinished
      ? 'BUILD SUCCESSFUL but package not in dumpsys yet'
      : 'package not installed yet'
  }
  if (expectedVersion && versionName !== expectedVersion) {
    return `installed versionName ${versionName} != expected ${expectedVersion}`
  }
  return 'installed versionName matches'
}

function staleVersionError(versionName, expectedVersion) {
  return (
    `installed versionName ${versionName} != expected ${expectedVersion}. ` +
    'Stamp VERIFY_APK_VERSION into android/gradle.properties and versionName ' +
    'so processDebugMainManifest is not UP-TO-DATE on a stale SHA.'
  )
}

function installTimeoutError({ pkg, serial, versionName, expectedVersion }) {
  return (
    `Timed out waiting for ${pkg} on ${serial}: ` +
    `installed versionName ${versionName ?? 'missing'} != expected ${expectedVersion}.`
  )
}

function installWaitTick({
  alive,
  versionName,
  expectedVersion,
  logText,
  buildFinished,
}) {
  const finished = buildFinished ?? gradleBuildFinished(logText)
  if (versionName && expectedVersion && versionName !== expectedVersion) {
    if (!alive || finished) {
      return {
        status: 'error',
        error: staleVersionError(versionName, expectedVersion),
        reason: installWaitReason({ versionName, expectedVersion, buildFinished: finished }),
      }
    }
    return {
      status: 'wait',
      reason: installWaitReason({ versionName, expectedVersion, buildFinished: finished }),
    }
  }
  if (versionName) return { status: 'ok' }
  if (!alive) return { status: 'error', error: expoDiedError(logText) }
  return {
    status: 'wait',
    reason: installWaitReason({ versionName, expectedVersion, buildFinished: finished }),
  }
}

function stampGradleProperties(contents, version) {
  const line = `${VERIFY_APK_VERSION_ENV}=${version}`
  if (/^VERIFY_APK_VERSION=/m.test(`${contents ?? ''}`)) {
    return `${contents}`.replace(/^VERIFY_APK_VERSION=.*$/m, line)
  }
  const body = `${contents ?? ''}`
  const suffix = body === '' || body.endsWith('\n') ? '' : '\n'
  return `${body}${suffix}${line}\n`
}

function stampBuildGradleVersionName(contents, version) {
  if (!/versionName\s+["'][^"']+["']/.test(`${contents ?? ''}`)) {
    return contents
  }
  return `${contents}`.replace(
    /versionName\s+["'][^"']+["']/,
    `versionName "${version}"`,
  )
}

function stampAndroidVersion({
  androidDir,
  version,
  exists = existsSync,
  read = readFileSync,
  write = writeFileSync,
  mkdir = mkdirSync,
} = {}) {
  if (!version) throw new Error('stampAndroidVersion requires a version')
  if (!androidDir || !exists(androidDir)) return { stamped: false, gradleStamped: false }
  mkdir(androidDir, { recursive: true })
  const propsPath = join(androidDir, 'gradle.properties')
  const previous = exists(propsPath) ? read(propsPath, 'utf8') : ''
  write(propsPath, stampGradleProperties(previous, version))
  const gradlePath = join(androidDir, 'app', 'build.gradle')
  let gradleStamped = false
  if (exists(gradlePath)) {
    const gradle = read(gradlePath, 'utf8')
    const next = stampBuildGradleVersionName(gradle, version)
    if (next !== gradle) {
      write(gradlePath, next)
      gradleStamped = true
    }
  }
  return { stamped: true, gradleStamped }
}

function upsertAndroidMetaData(xml, name, value) {
  const item = `<meta-data android:name="${name}" android:value="${value}"/>`
  const existing = new RegExp(
    `<meta-data\\s+android:name="${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s+android:value="[^"]*"\\s*/>`,
  )
  if (existing.test(`${xml ?? ''}`)) {
    return `${xml}`.replace(existing, item)
  }
  if (!/<\/application>/i.test(`${xml ?? ''}`)) return xml
  return `${xml}`.replace(/<\/application>/i, `    ${item}\n    </application>`)
}

function stampDevMenuManifest(contents) {
  let next = contents
  next = upsertAndroidMetaData(next, DEV_MENU_SHOWS_AT_LAUNCH_META, 'false')
  next = upsertAndroidMetaData(next, DEV_MENU_ONBOARDING_FINISHED_META, 'true')
  return next
}

function stampDevMenuLaunchPrefs({
  androidDir,
  exists = existsSync,
  read = readFileSync,
  write = writeFileSync,
} = {}) {
  if (!androidDir || !exists(androidDir)) return { stamped: false }
  const manifestPath = join(androidDir, 'app', 'src', 'main', 'AndroidManifest.xml')
  if (!exists(manifestPath)) return { stamped: false }
  const previous = read(manifestPath, 'utf8')
  const next = stampDevMenuManifest(previous)
  if (next === previous) return { stamped: false }
  write(manifestPath, next)
  return { stamped: true }
}

function shouldRebuildApk({ installedVersion, expectedVersion }) {
  return !installedVersion || installedVersion !== expectedVersion
}

function parseAppScheme(source) {
  if (typeof source !== 'string') return null
  const ts = source.match(
    /\bscheme\s*:\s*['"]([a-zA-Z][a-zA-Z0-9+.-]*)['"]/,
  )
  if (ts) return ts[1]
  const json = source.match(/"scheme"\s*:\s*"([a-zA-Z][a-zA-Z0-9+.-]*)"/)
  return json?.[1] ?? null
}

function parseAppSlug(source) {
  if (typeof source !== 'string') return null
  const ts = source.match(/\bslug\s*:\s*['"]([a-zA-Z0-9._-]+)['"]/)
  if (ts) return ts[1]
  const json = source.match(/"slug"\s*:\s*"([a-zA-Z0-9._-]+)"/)
  return json?.[1] ?? null
}

function expoDevClientScheme({ slug, scheme } = {}) {
  if (slug) return `exp+${slug}`
  return scheme ?? null
}

function readAppConfigSource(appDir = mobileDir) {
  for (const name of ['app.config.ts', 'app.config.js', 'app.json']) {
    const path = join(appDir, name)
    if (existsSync(path)) return readFileSync(path, 'utf8')
  }
  return null
}

function readAppScheme(appDir = mobileDir) {
  const source = readAppConfigSource(appDir)
  const scheme = parseAppScheme(source ?? '')
  if (scheme) return scheme
  throw new Error(`Could not read Expo scheme from ${appDir} app config`)
}

function readDevClientScheme(appDir = mobileDir) {
  const source = readAppConfigSource(appDir)
  const scheme = expoDevClientScheme({
    slug: parseAppSlug(source ?? ''),
    scheme: parseAppScheme(source ?? ''),
  })
  if (scheme) return scheme
  throw new Error(`Could not read Expo dev-client scheme from ${appDir} app config`)
}

function expoDevClientUrl({ scheme, metroPort }) {
  if (!scheme) {
    throw new Error('Expo scheme is required to open the dev client')
  }
  const metroUrl = `http://127.0.0.1:${metroPort}`
  return (
    `${scheme}://expo-development-client/?url=${encodeURIComponent(metroUrl)}` +
    `&${DEV_CLIENT_DISABLE_AUTO_LAUNCH}&${DEV_CLIENT_DISABLE_ONBOARDING}`
  )
}

function quoteForAdbShell(value) {
  // adb shell concatenates argv and /system/bin/sh re-parses, so & in a URL is a job separator.
  return `'${`${value ?? ''}`.replaceAll("'", `'\\''`)}'`
}

function adbReverseArgs(serial, port) {
  return ['-s', serial, 'reverse', `tcp:${port}`, `tcp:${port}`]
}

function adbOpenDevClientArgs({ serial, url, pkg }) {
  return [
    '-s',
    serial,
    'shell',
    'am',
    'start',
    '-a',
    'android.intent.action.VIEW',
    '-d',
    quoteForAdbShell(url),
    pkg,
  ]
}

function adbShellHttpGetArgs(serial, url) {
  const quoted = quoteForAdbShell(url)
  return [
    ['-s', serial, 'shell', 'wget', '-qO-', quoted],
    ['-s', serial, 'shell', 'toybox', 'wget', '-qO-', quoted],
    ['-s', serial, 'shell', 'curl', '-s', quoted],
  ]
}

function amStartSucceeded(result) {
  if (result.status === 0) return true
  return `${result.stderr ?? ''}\n${result.stdout ?? ''}`.includes(
    AM_START_ALREADY_FOREGROUND,
  )
}

function parseAdbReverseList(text) {
  const reversed = []
  for (const line of `${text ?? ''}`.split('\n')) {
    const match = line.match(/tcp:(\d+)\s+tcp:(\d+)/)
    if (match) {
      reversed.push({ device: Number(match[1]), host: Number(match[2]) })
    }
  }
  return reversed
}

function missingAdbReverses(reversed, requiredPorts) {
  return requiredPorts.filter(
    (port) =>
      !reversed.some((entry) => entry.device === port && entry.host === port),
  )
}

function parseUiDump(xml) {
  const text = `${xml ?? ''}`
  const hasSignIn = text.includes(SIGN_IN_TEST_ID)
  const hasWelcome = text.includes(WELCOME_SCREEN_TEST_ID)
  const hasSignInCopy = SIGN_IN_VISIBLE_MARKERS.some((marker) =>
    text.includes(marker),
  )
  const hasDevMenuOnboarding = DEV_MENU_ONBOARDING_MARKERS.some((marker) =>
    text.includes(marker),
  )
  const hasDevMenu = DEV_MENU_MARKERS.some((marker) => text.includes(marker))
  return {
    hasSignIn,
    hasWelcome,
    hasSignInCopy,
    hasDevMenuOnboarding,
    hasDevMenu,
    hasAppRoot: hasSignIn || hasWelcome || hasSignInCopy,
    hasDevLauncher: DEV_LAUNCHER_MARKERS.some((marker) => text.includes(marker)),
  }
}

function appForegroundReason(ui) {
  if (ui.hasDevMenuOnboarding) {
    return 'Expo developer-menu onboarding is covering the app'
  }
  if (ui.hasDevMenu) {
    return 'Expo developer menu is covering the app'
  }
  if (ui.hasDevLauncher) return 'Expo launcher is in the foreground'
  if (!ui.hasAppRoot) {
    return `${SIGN_IN_TEST_ID} / ${WELCOME_SCREEN_TEST_ID} not in the UI dump`
  }
  return 'app root visible'
}

function appForegroundTick({ dump }) {
  const ui = parseUiDump(dump)
  if (ui.hasDevMenuOnboarding || ui.hasDevMenu) {
    return { status: 'dismiss', ui, reason: appForegroundReason(ui) }
  }
  if (ui.hasAppRoot) return { status: 'ok', ui, reason: appForegroundReason(ui) }
  return { status: 'wait', ui, reason: appForegroundReason(ui) }
}

function parseUiNodeCenter(dump, text) {
  const needle = `${text ?? ''}`
  if (!needle) return null
  for (const node of `${dump ?? ''}`.match(/<node\b[^>]*>/g) ?? []) {
    const quoted = new RegExp(
      `(?:text|content-desc)="${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`,
    )
    if (!quoted.test(node)) continue
    const bounds = node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)
    if (!bounds) continue
    return {
      x: Math.floor((Number(bounds[1]) + Number(bounds[3])) / 2),
      y: Math.floor((Number(bounds[2]) + Number(bounds[4])) / 2),
    }
  }
  return null
}

function adbTapArgs(serial, x, y) {
  return ['-s', serial, 'shell', 'input', 'tap', String(x), String(y)]
}

function adbKeyEventArgs(serial, key) {
  return ['-s', serial, 'shell', 'input', 'keyevent', key]
}

function adbScreencapArgs(serial) {
  return ['-s', serial, 'exec-out', 'screencap', '-p']
}

function deviceFailureArtifactPaths(dest) {
  return {
    screenshotPath: join(dest, DEVICE_FAILURE_SCREENSHOT),
    dumpPath: join(dest, DEVICE_FAILURE_DUMP),
  }
}

function writeAdbScreenshot(serial, destPath) {
  const result = spawnSync(adbBin(), adbScreencapArgs(serial), {
    encoding: 'buffer',
    maxBuffer: 20 * 1024 * 1024,
  })
  if (result.status !== 0 || !result.stdout?.length) return null
  writeFileSync(destPath, result.stdout)
  return destPath
}

function captureDeviceFailure({ serial, dest, dump }) {
  ensureDir(dest)
  const paths = deviceFailureArtifactPaths(dest)
  writeFileSync(paths.dumpPath, dump ?? adbUiDump(serial))
  const screenshotPath = writeAdbScreenshot(serial, paths.screenshotPath)
  return {
    dumpPath: paths.dumpPath,
    screenshotPath,
  }
}

function dismissDevMenuOnboarding(serial, dump) {
  const center = parseUiNodeCenter(dump, DEV_MENU_CONTINUE_TEXT)
  if (!center) return false
  runCapture(adbBin(), adbTapArgs(serial, center.x, center.y), {
    allowFail: true,
  })
  return true
}

function dismissDevMenu(serial, dump) {
  const center = parseUiNodeCenter(dump, DEV_MENU_CLOSE_TEXT)
  if (center) {
    runCapture(adbBin(), adbTapArgs(serial, center.x, center.y), {
      allowFail: true,
    })
    return true
  }
  runCapture(adbBin(), adbKeyEventArgs(serial, 'KEYCODE_BACK'), {
    allowFail: true,
  })
  return true
}

function dismissDevMenuOverlay(serial, dump) {
  const ui = parseUiDump(dump)
  if (ui.hasDevMenuOnboarding) return dismissDevMenuOnboarding(serial, dump)
  if (ui.hasDevMenu) return dismissDevMenu(serial, dump)
  return false
}

function devLauncherForegroundMessage() {
  return (
    'Expo dev-client launcher is in the foreground (Development servers). ' +
    'The app is not connected to Metro. Open the expo-development-client deep link.'
  )
}

function devMenuOnboardingMessage() {
  return (
    'Expo developer-menu onboarding is covering the app ' +
    '(This is the developer menu). Tap Continue.'
  )
}

function devMenuForegroundMessage() {
  return (
    'Expo developer menu is covering the app (Runtime version / Go home). ' +
    'Tap Close or press Back.'
  )
}

function deviceReadyProblems({
  reverseList = '',
  requiredPorts = [],
  deviceStatusBody = null,
  checkedDeviceMetro = false,
  ui = null,
} = {}) {
  const problems = []
  for (const port of missingAdbReverses(
    parseAdbReverseList(reverseList),
    requiredPorts,
  )) {
    problems.push(
      `adb reverse does not map tcp:${port} on the device ` +
        `(host Metro/web will not be reachable at 127.0.0.1:${port})`,
    )
  }
  if (
    checkedDeviceMetro &&
    (deviceStatusBody == null || !isMetroReady(deviceStatusBody))
  ) {
    problems.push(
      `Metro is not reachable from the device at 127.0.0.1 (expected ${METRO_READY_MARKER})`,
    )
  }
  if (ui?.hasDevMenuOnboarding) {
    problems.push(devMenuOnboardingMessage())
  } else if (ui?.hasDevMenu) {
    problems.push(devMenuForegroundMessage())
  } else if (ui?.hasDevLauncher && !ui.hasAppRoot) {
    problems.push(devLauncherForegroundMessage())
  }
  return problems
}

function resolveEmulatorAttachment({
  serial,
  devices = [],
  chosenAvd,
  runningAvd = null,
  explicitAvd = false,
} = {}) {
  const found = devices.find((device) => device.serial === serial)
  if (!found) return { action: 'boot', avdName: chosenAvd }
  if (found.state !== 'device') {
    return { action: 'wait', state: found.state, avdName: chosenAvd }
  }
  if (explicitAvd && runningAvd && runningAvd !== chosenAvd) {
    throw new Error(`${serial} is AVD ${runningAvd}, not ${chosenAvd}`)
  }
  return { action: 'attach', avdName: runningAvd || chosenAvd }
}

function hasExplicitAvd(env = process.env) {
  return Boolean(`${env?.VERIFY_AVD ?? ''}`.trim())
}

function maestroDeviceArgs({
  serial,
  dest,
  flowPath,
  expoDevClientUrl: url,
}) {
  const args = ['--device', serial, 'test']
  if (url) args.push('-e', `EXPO_DEV_CLIENT_URL=${url}`)
  args.push('--debug-output', dest, flowPath)
  return args
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

function killEmulatorSerial({
  serial,
  pid,
  stopped = [],
  run = runCapture,
  adb = adbBin,
} = {}) {
  if (serial) {
    try {
      run(adb(), adbEmuKillArgs(serial), { allowFail: true })
    } catch {
      // adb missing — fall through to the pid
    }
  }
  if (pid) stopRecordedPid(pid, 'emulator', stopped)
  return stopped
}

async function waitForSerialReady(serial, timeoutMs, opts = {}) {
  const now = opts.now ?? Date.now
  const sleepFn = opts.sleep ?? sleep
  const listDevices = opts.listDevices ?? adbDevices
  const kill = opts.kill ?? ((target) => killEmulatorSerial({ serial: target }))
  const staleAfter = opts.staleAfterMs ?? SERIAL_STALE_KILL_AFTER_MS
  const pollMs = opts.pollMs ?? SERIAL_POLL_MS
  const start = now()
  let killed = false
  let lastProgressAt = 0
  while (now() - start < timeoutMs) {
    const tick = serialWaitTick({ serial, devices: listDevices() })
    if (tick.status === 'device') return { action: 'attach', state: 'device' }
    if (tick.status === 'gone') return { action: 'boot', state: null }
    const elapsed = now() - start
    if (!killed && elapsed >= staleAfter) {
      console.error(
        `${serial} is still ${tick.state}; killing the stale emulator`,
      )
      kill(serial)
      killed = true
      lastProgressAt = elapsed
    } else if (elapsed - lastProgressAt >= INSTALL_PROGRESS_INTERVAL_MS) {
      console.error(`still waiting: ${serial} is ${tick.state}`)
      lastProgressAt = elapsed
    }
    await sleepFn(pollMs)
  }
  const last = serialWaitTick({ serial, devices: listDevices() })
  if (last.status === 'device') return { action: 'attach', state: 'device' }
  if (last.status !== 'gone') kill(serial)
  return { action: 'boot', state: last.state ?? null }
}

async function waitForSerialGone(serial, timeoutMs, opts = {}) {
  const now = opts.now ?? Date.now
  const sleepFn = opts.sleep ?? sleep
  const listDevices = opts.listDevices ?? adbDevices
  const pollMs = opts.pollMs ?? SERIAL_POLL_MS
  const start = now()
  while (now() - start < timeoutMs) {
    if (serialWaitTick({ serial, devices: listDevices() }).status === 'gone') {
      return { status: 'ok' }
    }
    await sleepFn(pollMs)
  }
  const last = serialWaitTick({ serial, devices: listDevices() })
  if (last.status === 'gone') return { status: 'ok' }
  return { status: 'timeout', state: last.state }
}

async function waitForPortFree(port, timeoutMs, opts = {}) {
  const now = opts.now ?? Date.now
  const sleepFn = opts.sleep ?? sleep
  const listPids = opts.listPids ?? portListenerPids
  const pollMs = opts.pollMs ?? PORT_FREE_POLL_MS
  const start = now()
  while (now() - start < timeoutMs) {
    const tick = portFreeTick(listPids(port))
    if (tick.status === 'ok') return tick
    await sleepFn(pollMs)
  }
  return portFreeTick(listPids(port))
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
  const portFree = await waitForPortFree(port, PORT_FREE_TIMEOUT_MS)
  if (portFree.status !== 'ok') {
    die(portBusyMessage(port, portFree.pids, 'metro'))
  }

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
    const versionName = installedVersionName(serial, pkg)
    const alive = opts.pid == null ? true : pidAlive(opts.pid)
    const logText =
      opts.logPath && existsSync(opts.logPath)
        ? readFileSync(opts.logPath, 'utf8')
        : ''
    const tick = installWaitTick({
      alive,
      versionName,
      expectedVersion: opts.expectedVersion,
      logText,
    })
    if (tick.status === 'ok') return versionName
    if (tick.status === 'error') throw new Error(tick.error)
    if (now - lastProgressAt >= INSTALL_PROGRESS_INTERVAL_MS) {
      const logHint = opts.logPath ? ` See ${opts.logPath}` : ''
      const reason = tick.reason ? ` still waiting: ${tick.reason}.` : ''
      console.error(`building/installing ${pkg} on ${serial}…${reason}${logHint}`)
      lastProgressAt = now
    }
    await sleep(2_000)
  }
  const versionName = installedVersionName(serial, pkg)
  throw new Error(
    installTimeoutError({
      pkg,
      serial,
      versionName,
      expectedVersion: opts.expectedVersion,
    }),
  )
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

function adbReverse(serial, port) {
  const result = runCapture(adbBin(), adbReverseArgs(serial, port), {
    allowFail: true,
  })
  if (result.status !== 0) {
    throw new Error(
      `adb reverse tcp:${port} failed: ${`${result.stderr ?? ''} ${result.stdout ?? ''}`.trim()}`,
    )
  }
}

function adbClearReverses(serial) {
  runCapture(adbBin(), ['-s', serial, 'reverse', '--remove-all'], {
    allowFail: true,
  })
}

function adbReverseList(serial) {
  return runCapture(adbBin(), ['-s', serial, 'reverse', '--list'], {
    allowFail: true,
  }).stdout
}

function adbUiDump(serial) {
  runCapture(
    adbBin(),
    ['-s', serial, 'shell', 'uiautomator', 'dump', '/sdcard/window_dump.xml'],
    { allowFail: true },
  )
  return `${
    runCapture(
      adbBin(),
      ['-s', serial, 'shell', 'cat', '/sdcard/window_dump.xml'],
      { allowFail: true },
    ).stdout ?? ''
  }`
}

function fetchDeviceMetroStatus(serial, port) {
  const url = `http://127.0.0.1:${port}/status`
  for (const args of adbShellHttpGetArgs(serial, url)) {
    const result = runCapture(adbBin(), args, { allowFail: true })
    const body = `${result.stdout ?? ''}`.trim()
    if (body) return { body, checked: true }
  }
  return { body: null, checked: false }
}

function openDevClient(serial, url, pkg) {
  const result = runCapture(
    adbBin(),
    adbOpenDevClientArgs({ serial, url, pkg }),
    { allowFail: true },
  )
  if (!amStartSucceeded(result)) {
    throw new Error(
      `Failed to open expo-development-client deep link: ${`${result.stderr ?? ''} ${result.stdout ?? ''}`.trim()}`,
    )
  }
}

async function waitForAppForeground(serial, timeoutMs) {
  const start = Date.now()
  let lastProgressAt = 0
  while (Date.now() - start < timeoutMs) {
    const now = Date.now()
    const dump = adbUiDump(serial)
    const tick = appForegroundTick({ dump })
    if (tick.status === 'ok') return tick.ui
    if (tick.status === 'dismiss') {
      const tapLabel = tick.ui.hasDevMenuOnboarding
        ? DEV_MENU_CONTINUE_TEXT
        : DEV_MENU_CLOSE_TEXT
      console.error(`still waiting: ${tick.reason}; tapping ${tapLabel}`)
      dismissDevMenuOverlay(serial, dump)
      lastProgressAt = now
    } else if (now - lastProgressAt >= APP_READY_PROGRESS_INTERVAL_MS) {
      console.error(`still waiting: ${tick.reason}`)
      lastProgressAt = now
    }
    await sleep(1_000)
  }
  const dump = adbUiDump(serial)
  const ui = parseUiDump(dump)
  const dest = join(
    artifactsDir,
    `launch-wait-${new Date().toISOString().replace(/[:.]/g, '-')}`,
  )
  captureDeviceFailure({ serial, dest, dump })
  if (ui.hasDevMenuOnboarding) throw new Error(devMenuOnboardingMessage())
  if (ui.hasDevMenu) throw new Error(devMenuForegroundMessage())
  if (ui.hasDevLauncher) throw new Error(devLauncherForegroundMessage())
  throw new Error(
    `Timed out waiting for ${SIGN_IN_TEST_ID} or ${WELCOME_SCREEN_TEST_ID} on ${serial}. ` +
      `See ${join(dest, DEVICE_FAILURE_SCREENSHOT)} and ${join(dest, DEVICE_FAILURE_DUMP)}.`,
  )
}

async function ensureDeviceMetro(port, extraEnv = {}) {
  const baseUrl = `http://localhost:${port}`
  try {
    await waitForMetro(baseUrl, 10_000)
    return { metroPid: null, reused: true, baseUrl, port }
  } catch {
    // expo run:android did not leave Metro up — start one with the device env.
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
        ...extraEnv,
      },
      stdio: ['ignore', logFd, logFd],
      detached: true,
    },
  )
  metro.unref()
  await waitForMetro(baseUrl, DEVICE_METRO_WAIT_MS)
  return { metroPid: metro.pid, reused: false, baseUrl, port, logPath }
}

function launchDeviceTeardownPlan(partial) {
  return {
    stopExpo: Boolean(partial.expoPid),
    stopMetro: Boolean(partial.metroPid),
    stopEmulator: Boolean(partial.emulatorPid),
    stopWeb: Boolean(partial.webPid),
    clearReverses: Boolean(partial.serial),
    uninstallPackage: false,
  }
}

function stopLaunchDevice(partial, stopped = []) {
  const plan = launchDeviceTeardownPlan(partial)
  if (partial.expoPid) stopRecordedPid(partial.expoPid, 'expo', stopped)
  if (partial.metroPid) stopRecordedPid(partial.metroPid, 'metro', stopped)
  // A failed wait still leaves the APK we just installed. Cleanup uninstalls.
  if (plan.clearReverses) adbClearReverses(partial.serial)
  if (partial.emulatorPid) {
    killEmulatorSerial({
      serial: partial.serial,
      pid: partial.emulatorPid,
      stopped,
    })
  }
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
  const metroPort = DEFAULT_METRO_PORT
  const metroFree = await waitForPortFree(metroPort, PORT_FREE_TIMEOUT_MS)
  if (metroFree.status !== 'ok') {
    die(portBusyMessage(metroPort, metroFree.pids, 'metro'))
  }
  const webFree = await waitForPortFree(webPort, PORT_FREE_TIMEOUT_MS)
  if (webFree.status !== 'ok') {
    die(portBusyMessage(webPort, webFree.pids, 'web'))
  }

  const sdk = resolveSdkRoot()
  if (!sdk) {
    die(missingSdkError())
  }
  const emu = join(sdk, 'emulator', 'emulator')
  console.error(`Using Android SDK ${sdk} (emulator ${emu})`)

  let java
  try {
    java = resolveGradleJava()
  } catch (error) {
    die(error.message)
  }
  console.error(
    java.javaHome
      ? `Using Java ${java.major} at ${java.javaHome}`
      : `Using Java ${java.major} from PATH (${java.javaBin})`,
  )

  const chosenAvd = chosenAvdName()
  const settled = await waitForSerialReady(DEVICE_SERIAL, SERIAL_SETTLE_TIMEOUT_MS)
  let runningAvd = null
  if (settled.action === 'attach') {
    runningAvd = parseAvdName(
      runCapture(adbBin(), ['-s', DEVICE_SERIAL, 'emu', 'avd', 'name'], {
        allowFail: true,
      }).stdout,
    )
  }
  let attachment
  try {
    attachment = resolveEmulatorAttachment({
      serial: DEVICE_SERIAL,
      devices:
        settled.action === 'attach'
          ? [{ serial: DEVICE_SERIAL, state: 'device' }]
          : adbDevices(),
      chosenAvd,
      runningAvd,
      explicitAvd: hasExplicitAvd(),
    })
  } catch (error) {
    die(error.message)
  }
  if (attachment.action === 'wait') {
    console.error(
      `${DEVICE_SERIAL} is still ${attachment.state}; booting a new emulator`,
    )
    attachment = { action: 'boot', avdName: chosenAvd }
  }
  const avdName = attachment.avdName
  if (attachment.action === 'boot') {
    try {
      requireAvd(avdName, listInstalledAvds())
    } catch (error) {
      die(error.message)
    }
  }

  ensureDir(runDir)
  ensureDir(artifactsDir)

  if (!existsSync(join(repoRoot, 'node_modules'))) {
    console.error('Installing workspace dependencies…')
    run('pnpm', ['install', '--frozen-lockfile'])
  }

  const autolink = inspectExpoAutolinking()
  if (autolink.problems.length > 0) {
    die(autolink.problems.join('\n'))
  }

  let scheme
  try {
    scheme = readDevClientScheme()
  } catch (error) {
    die(error.message)
  }

  const expectedSha = gitHeadShortSha()
  const androidStamp = stampAndroidVersion({
    androidDir: join(mobileDir, 'android'),
    version: expectedSha,
  })
  if (androidStamp.stamped) {
    console.error(
      androidStamp.gradleStamped
        ? `Stamped ${VERIFY_APK_VERSION_ENV}=${expectedSha} into android/gradle.properties and versionName`
        : `Stamped ${VERIFY_APK_VERSION_ENV}=${expectedSha} into android/gradle.properties`,
    )
  }
  const menuStamp = stampDevMenuLaunchPrefs({
    androidDir: join(mobileDir, 'android'),
  })
  if (menuStamp.stamped) {
    console.error(
      `Stamped ${DEV_MENU_SHOWS_AT_LAUNCH_META}=false so the developer menu does not auto-open`,
    )
  }
  const partial = {
    serial: DEVICE_SERIAL,
    androidPackage: ANDROID_PACKAGE,
    emulatorPid: null,
    metroPid: null,
    webPid: null,
    expoPid: null,
  }

  try {
    const emulatorLog = join(runDir, 'emulator.log')
    let emulatorPid = null
    if (attachment.action === 'attach') {
      console.error(`Attaching to existing ${DEVICE_SERIAL} (AVD ${avdName})`)
      await waitForBootCompleted(DEVICE_SERIAL, EMULATOR_BOOT_TIMEOUT_MS)
    } else {
      const emulator = spawnLogged(
        emu,
        emulatorLaunchArgs(avdName, chosenEmulatorGpu()),
        emulatorLog,
        { env: sdkChildEnv(sdk) },
      )
      emulatorPid = emulator.pid
      partial.emulatorPid = emulatorPid
      await waitForBootCompleted(DEVICE_SERIAL, EMULATOR_BOOT_TIMEOUT_MS, {
        pid: emulatorPid,
        logPath: emulatorLog,
      })
    }

    console.error(
      `Starting the web app on port ${webPort} with E2E_BYPASS_AUTH=true…`,
    )
    const web = startWebApp(webPort)
    partial.webPid = web.webPid

    const installed = installedVersionName(DEVICE_SERIAL, ANDROID_PACKAGE)
    const rebuild = shouldRebuildApk({
      installedVersion: installed,
      expectedVersion: expectedSha,
    })
    if (rebuild && installed) {
      console.error(
        `Installed ${ANDROID_PACKAGE} versionName ${installed} != git HEAD ${expectedSha}; uninstalling and rebuilding`,
      )
      uninstallPackage(DEVICE_SERIAL, ANDROID_PACKAGE)
    }

    const expoLog = join(runDir, 'expo-android.log')
    const expo = spawnLogged(
      'pnpm',
      expoAndroidArgs(avdName, { rebuild, port: metroPort }),
      expoLog,
      {
        cwd: repoRoot,
        env: {
          ...sdkChildEnv(sdk),
          CI: '1',
          EXPO_NO_TELEMETRY: '1',
          ...deviceExpoPublicEnv(webPort),
          [VERIFY_APK_VERSION_ENV]: expectedSha,
          ...(java.javaHome ? { JAVA_HOME: java.javaHome } : {}),
        },
      },
    )
    partial.expoPid = expo.pid

    const versionName = await waitForInstalledPackage(
      DEVICE_SERIAL,
      ANDROID_PACKAGE,
      EXPO_INSTALL_TIMEOUT_MS,
      {
        logPath: expoLog,
        pid: expo.pid,
        expectedVersion: expectedSha,
      },
    )

    const metro = await ensureDeviceMetro(metroPort, deviceExpoPublicEnv(webPort))
    if (metro.metroPid) partial.metroPid = metro.metroPid

    console.error(
      `adb reverse tcp:${metroPort} and tcp:${webPort}; opening expo-development-client`,
    )
    adbReverse(DEVICE_SERIAL, metroPort)
    adbReverse(DEVICE_SERIAL, webPort)
    const devClientUrl = expoDevClientUrl({ scheme, metroPort })
    openDevClient(DEVICE_SERIAL, devClientUrl, ANDROID_PACKAGE)
    await waitForAppForeground(DEVICE_SERIAL, APP_READY_TIMEOUT_MS)

    const state = {
      runId: `verify-${new Date().toISOString().replace(/[:.]/g, '-')}`,
      harness: HARNESS_MAESTRO,
      serial: DEVICE_SERIAL,
      avdName,
      attachedEmulator: attachment.action === 'attach',
      androidPackage: ANDROID_PACKAGE,
      emulatorPid,
      metroPid: metro.metroPid,
      port: metroPort,
      baseUrl: metro.baseUrl,
      scheme,
      expoDevClientUrl: devClientUrl,
      webPid: web.webPid,
      webPort: web.webPort,
      webBaseUrl: web.webBaseUrl,
      expoPid: expo.pid,
      gitHead: expectedSha,
      versionName,
      logPath: expoLog,
      emulatorLog,
      sdkRoot: sdk,
      javaHome: java.javaHome,
      javaMajor: java.major,
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
          attachedEmulator: state.attachedEmulator,
          androidPackage: ANDROID_PACKAGE,
          emulatorPid,
          metroPid: metro.metroPid,
          port: metroPort,
          baseUrl: metro.baseUrl,
          scheme,
          expoDevClientUrl: devClientUrl,
          webPid: web.webPid,
          webPort: web.webPort,
          webBaseUrl: web.webBaseUrl,
          expoPid: expo.pid,
          versionName,
          gitHead: expectedSha,
          sdkRoot: sdk,
          javaHome: java.javaHome,
          javaMajor: java.major,
          ready: `${ANDROID_PACKAGE} versionName ${versionName} on ${DEVICE_SERIAL} past the Expo launcher`,
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
  const logPath = maestroLogPath(dest)

  const devClientUrl =
    state.expoDevClientUrl ??
    expoDevClientUrl({
      scheme: state.scheme ?? readDevClientScheme(),
      metroPort: state.port ?? DEFAULT_METRO_PORT,
    })
  const test = await runTee(
    'maestro',
    maestroDeviceArgs({
      serial: state.serial,
      dest,
      flowPath,
      expoDevClientUrl: devClientUrl,
    }),
    { logPath, cwd: shotDir },
  )
  writeFileSync(logPath, test.stdout ?? '')
  if (test.status !== 0) {
    const captured = captureDeviceFailure({ serial: state.serial, dest })
    copyPngFiles(shotDir, dest)
    const logText = test.stdout ?? ''
    die(
      maestroFailureMessage({
        flow,
        dest,
        step: parseMaestroFailedStep(logText),
        tail: maestroLogTail(logText),
        screenshotPath:
          captured.screenshotPath ?? join(dest, DEVICE_FAILURE_SCREENSHOT),
        dumpPath: captured.dumpPath,
      }),
    )
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

const EXPO_PACKAGE_IMPORT_RE =
  /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"](expo(?:-[a-z0-9-]+)*)['"]/g
const AUTOLINK_SOURCE_EXT = new Set([
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.jsx',
])

function parseExpoPackageImports(source) {
  const names = new Set()
  if (typeof source !== 'string') return []
  for (const match of source.matchAll(EXPO_PACKAGE_IMPORT_RE)) {
    names.add(match[1])
  }
  return [...names].sort()
}

function parseAutolinkedPackageNames(resolveJson) {
  const parsed =
    typeof resolveJson === 'string' ? JSON.parse(resolveJson) : resolveJson
  return (parsed?.modules ?? [])
    .map((module) => module?.packageName)
    .filter(Boolean)
}

function missingAutolinkedExpoModules({
  imported = [],
  linked = [],
  treatAsNative = () => true,
} = {}) {
  const linkedSet = new Set(linked)
  return imported.filter(
    (name) => !linkedSet.has(name) && treatAsNative(name),
  )
}

function shouldScanDependency(name) {
  if (name === 'react' || name === 'react-native' || name === 'expo') {
    return false
  }
  if (name.startsWith('expo-') || name.startsWith('@expo/')) return false
  if (name.startsWith('@react-native')) return false
  return true
}

function resolvePackageDir(name, fromDir) {
  try {
    const req = createRequire(join(fromDir, 'package.json'))
    try {
      return dirname(req.resolve(`${name}/package.json`))
    } catch {
      const entry = req.resolve(name)
      let dir = dirname(entry)
      while (dir !== dirname(dir)) {
        const pkgPath = join(dir, 'package.json')
        if (existsSync(pkgPath)) {
          const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
          if (pkg.name === name) return dir
        }
        dir = dirname(dir)
      }
      return null
    }
  } catch {
    return null
  }
}

function walkSourceFiles(root, onSource) {
  if (!existsSync(root)) return
  const entries = readdirSync(root, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue
    const path = join(root, entry.name)
    if (entry.isDirectory()) {
      walkSourceFiles(path, onSource)
      continue
    }
    if (entry.name.endsWith('.d.ts')) continue
    if (!AUTOLINK_SOURCE_EXT.has(extname(entry.name))) continue
    onSource(readFileSync(path, 'utf8'))
  }
}

function collectImportedExpoPackages(roots) {
  const names = new Set()
  for (const root of roots) {
    walkSourceFiles(root, (source) => {
      for (const name of parseExpoPackageImports(source)) names.add(name)
    })
  }
  return [...names].sort()
}

function mobileImportRoots(appDir = mobileDir) {
  const roots = [join(appDir, 'src')]
  const pkgPath = join(appDir, 'package.json')
  if (!existsSync(pkgPath)) return roots
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  for (const name of Object.keys(pkg.dependencies ?? {})) {
    if (!shouldScanDependency(name)) continue
    const dir = resolvePackageDir(name, appDir)
    if (dir) roots.push(dir)
  }
  return roots
}

function expoModuleSupportsPlatform(config, platform = 'android') {
  const platforms = config?.platforms ?? []
  if (platform === 'android') {
    return platforms.includes('android') || Boolean(config?.android)
  }
  if (platform === 'apple' || platform === 'ios') {
    return (
      platforms.includes('apple') ||
      platforms.includes('ios') ||
      Boolean(config?.apple)
    )
  }
  return platforms.includes(platform)
}

function isExpoNativeOrMissing(
  name,
  fromDir = mobileDir,
  platform = 'android',
) {
  const dir = resolvePackageDir(name, fromDir)
  // Unresolved: pnpm will not autolink a transitive / optional peer.
  if (!dir) return true
  const configPath = join(dir, 'expo-module.config.json')
  if (!existsSync(configPath)) return false
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf8'))
    return expoModuleSupportsPlatform(config, platform)
  } catch {
    return true
  }
}

function readAutolinkedPackageNames({
  cwd = mobileDir,
  run = runCapture,
} = {}) {
  const result = run(
    'pnpm',
    [
      'exec',
      'expo-modules-autolinking',
      'resolve',
      '-p',
      'android',
      '--json',
      '--project-root',
      cwd,
    ],
    { cwd, allowFail: true },
  )
  if (result.status !== 0) {
    throw new Error(
      `expo-modules-autolinking resolve failed: ${`${result.stderr ?? ''} ${result.stdout ?? ''}`.trim()}`,
    )
  }
  const stdout = `${result.stdout ?? ''}`
  const start = stdout.indexOf('{')
  if (start === -1) {
    throw new Error('expo-modules-autolinking resolve printed no JSON')
  }
  return parseAutolinkedPackageNames(stdout.slice(start))
}

function missingAutolinkMessage(name) {
  return (
    `JS imports ${name} but Expo autolinking did not resolve it. ` +
    `Add it as a direct apps/mobile dependency (\`npx expo install ${name}\`) ` +
    'so the native module is in the APK. Under pnpm, transitive Expo modules are not linked.'
  )
}

function inspectExpoAutolinking(opts = {}) {
  try {
    const imported =
      opts.imported ??
      collectImportedExpoPackages(opts.roots ?? mobileImportRoots())
    const linked = opts.linked ?? readAutolinkedPackageNames({ run: opts.run })
    const treatAsNative =
      opts.treatAsNative ?? ((name) => isExpoNativeOrMissing(name))
    const missing = missingAutolinkedExpoModules({
      imported,
      linked,
      treatAsNative,
    })
    return {
      imported,
      linked,
      missing,
      problems: missing.map((name) => missingAutolinkMessage(name)),
    }
  } catch (error) {
    return {
      imported: [],
      linked: [],
      missing: [],
      problems: [`expo autolinking check failed: ${error.message}`],
    }
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

  let javaHome = state.javaHome ?? null
  let javaMajor = state.javaMajor ?? null
  try {
    const java = resolveGradleJava()
    javaHome = java.javaHome
    javaMajor = java.major
  } catch (error) {
    problems.push(error.message)
  }

  const metroPort = state.port ?? DEFAULT_METRO_PORT
  const hostMetroUrl = state.baseUrl ?? `http://localhost:${metroPort}`
  let hostMetroReady = false
  try {
    const response = await fetchText(`${hostMetroUrl}/status`, timeoutMs)
    hostMetroReady = isMetroReady(response.body)
    if (!hostMetroReady) {
      problems.push(
        `host Metro at ${hostMetroUrl}/status is not ${METRO_READY_MARKER}`,
      )
    }
  } catch (error) {
    problems.push(`host Metro at ${hostMetroUrl} is not answering: ${error.message}`)
  }

  let reverseList = ''
  let ui = null
  let deviceMetro = { body: null, checked: false }
  if (serial && attached?.state === 'device') {
    reverseList = `${adbReverseList(serial) ?? ''}`
    ui = parseUiDump(adbUiDump(serial))
    deviceMetro = fetchDeviceMetroStatus(serial, metroPort)
    problems.push(
      ...deviceReadyProblems({
        reverseList,
        requiredPorts: [metroPort, state.webPort ?? DEFAULT_DEVICE_WEB_PORT],
        checkedDeviceMetro: deviceMetro.checked,
        deviceStatusBody: deviceMetro.body,
        ui,
      }),
    )
  }

  return {
    ok: problems.length === 0,
    serial,
    avdName: state.avdName ?? AVD_NAME,
    attachedEmulator: Boolean(state.attachedEmulator),
    androidPackage: pkg,
    versionName,
    gitHead: expectedSha,
    webPort: state.webPort,
    webBaseUrl: webUrl,
    webStatus,
    port: metroPort,
    baseUrl: hostMetroUrl,
    hostMetroReady,
    scheme: state.scheme ?? null,
    expoDevClientUrl: state.expoDevClientUrl ?? null,
    foreground: ui,
    sdkRoot: state.sdkRoot ?? resolveSdkRoot(),
    javaHome,
    javaMajor,
    devices: devices.map((device) => device.serial),
    harness: HARNESS_MAESTRO,
    problems,
  }
}

async function inspectInstance(state) {
  const problems = []
  let metro = null
  let device = null
  const autolinking = inspectExpoAutolinking()
  problems.push(...autolinking.problems)
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
    importedExpoModules: autolinking.imported,
    autolinkedExpoModules: autolinking.linked,
    missingAutolinkedExpoModules: autolinking.missing,
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

function verifyListenPorts(env = process.env) {
  return [
    { port: Number(env.VERIFY_METRO_PORT ?? DEFAULT_METRO_PORT), kind: 'metro' },
    { port: chosenDeviceWebPort(env), kind: 'web' },
  ]
}

function stopListenersOnVerifyPorts(stopped = [], env = process.env) {
  for (const { port, kind } of verifyListenPorts(env)) {
    if (!Number.isInteger(port) || port <= 0) continue
    for (const pid of portListenerPids(port)) {
      stopRecordedPid(pid, kind, stopped)
    }
  }
  return stopped
}

async function cmdCleanup() {
  const state = readState()
  const stopped = []
  let killedSerial = null
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
    if (state.serial) adbClearReverses(state.serial)
    if (state.emulatorPid) {
      killEmulatorSerial({
        serial: state.serial,
        pid: state.emulatorPid,
        stopped,
      })
      killedSerial = state.serial ?? DEVICE_SERIAL
    }
    if (state.webPid) stopRecordedPid(state.webPid, 'web', stopped)
  }
  stopListenersOnVerifyPorts(stopped)
  if (killedSerial) {
    const gone = await waitForSerialGone(killedSerial, EMULATOR_GONE_TIMEOUT_MS)
    if (gone.status !== 'ok') {
      console.error(
        `Timed out waiting for ${killedSerial} to leave adb devices (still ${gone.state}).`,
      )
    }
  }
  for (const { port } of verifyListenPorts()) {
    await waitForPortFree(port, PORT_FREE_TIMEOUT_MS)
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

async function cmdVerifyDevice(flow) {
  const plan = verifyDevicePlan(flow)
  console.error(
    `verify-device: ${plan.steps.join(' → ')} (${plan.flow}); ` +
      'the instance stays up if a later step fails',
  )
  await cmdCleanup()
  await cmdLaunchDevice()
  await cmdDoctor()
  await cmdDriveDevice(plan.flow)
}

function usage() {
  console.log(`Usage: helpers/control <launch|launch-device|doctor|drive|drive-device|verify-device|cleanup>

  launch              Start Expo Metro on VERIFY_METRO_PORT (default 8081)
  launch-device       Attach or boot ${DEVICE_SERIAL}, rebuild if versionName is stale, reverse Metro/web, open the expo-development-client deep link
  doctor              Read-only check that this instance is worth driving
  drive welcome       Render the signed-in welcome screen with React Native Testing Library
  drive sign-in       Render the signed-out sign-in screen with React Native Testing Library
  drive-device <flow> Run Maestro flows/<flow>.yaml on ${DEVICE_SERIAL}
  verify-device [flow] cleanup → launch-device → doctor → drive-device (default ${DEFAULT_VERIFY_DEVICE_FLOW}); leave the instance up on failure
  cleanup             Stop recorded pids, free VERIFY_METRO_PORT and VERIFY_PORT, uninstall the package from a recorded serial; keep artifacts/

`)
}

export {
  isMetroReady,
  bundleHasAppMarker,
  fetchAppBundle,
  inspectMetro,
  parseExpoPackageImports,
  parseAutolinkedPackageNames,
  missingAutolinkedExpoModules,
  collectImportedExpoPackages,
  inspectExpoAutolinking,
  expoModuleSupportsPlatform,
  parseAppScheme,
  parseAppSlug,
  expoDevClientScheme,
  readAppScheme,
  readDevClientScheme,
  expoDevClientUrl,
  gradleBuildFinished,
  installWaitReason,
  installTimeoutError,
  stampGradleProperties,
  stampBuildGradleVersionName,
  stampAndroidVersion,
  stampDevMenuManifest,
  stampDevMenuLaunchPrefs,
  quoteForAdbShell,
  adbReverseArgs,
  adbOpenDevClientArgs,
  adbShellHttpGetArgs,
  amStartSucceeded,
  parseAdbReverseList,
  missingAdbReverses,
  parseUiDump,
  parseUiNodeCenter,
  appForegroundTick,
  appForegroundReason,
  portBusyMessage,
  adbTapArgs,
  adbKeyEventArgs,
  adbScreencapArgs,
  deviceFailureArtifactPaths,
  launchDeviceTeardownPlan,
  verifyListenPorts,
  serialWaitTick,
  waitForSerialReady,
  waitForSerialGone,
  waitForPortFree,
  adbEmuKillArgs,
  killEmulatorSerial,
  portFreeTick,
  verifyDevicePlan,
  shouldRebuildApk,
  resolveEmulatorAttachment,
  deviceReadyProblems,
  maestroDeviceArgs,
  maestroLogPath,
  maestroLogTail,
  parseMaestroFailedStep,
  maestroFailureMessage,
  parseAdbDevices,
  parseDumpsysVersionName,
  parseAvdName,
  parseEmulatorAvdList,
  chosenAvdName,
  requireAvd,
  bootWaitTick,
  expoAndroidArgs,
  installWaitTick,
  resolveSdkRoot,
  chosenEmulatorGpu,
  emulatorLaunchArgs,
  parseJavaMajor,
  resolveGradleJava,
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
  VERIFY_APK_VERSION_ENV,
  SIGN_IN_TEST_ID,
  WELCOME_SCREEN_TEST_ID,
  DEV_MENU_CONTINUE_TEXT,
  DEV_MENU_CLOSE_TEXT,
  DEV_CLIENT_DISABLE_AUTO_LAUNCH,
  DEV_CLIENT_DISABLE_ONBOARDING,
  AM_START_ALREADY_FOREGROUND,
  DEVICE_FAILURE_SCREENSHOT,
  DEVICE_FAILURE_DUMP,
  MAESTRO_LOG_NAME,
  DEFAULT_VERIFY_DEVICE_FLOW,
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
    case 'verify-device':
      await cmdVerifyDevice(rest[0])
      break
    case 'cleanup':
      await cmdCleanup()
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
