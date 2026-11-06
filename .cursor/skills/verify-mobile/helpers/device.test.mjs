import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import {
  parseAdbDevices,
  parseDumpsysVersionName,
  parseAvdName,
  parseEmulatorAvdList,
  chosenAvdName,
  requireAvd,
  bootWaitTick,
  expoAndroidArgs,
  spawnExpoAndroid,
  metroStartArgs,
  metroSpawnSpec,
  metroStatusUrls,
  metroWaitTick,
  metroDiedError,
  metroTimeoutError,
  BUNDLE_PATHS,
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
  quoteForAdbShell,
  adbReverseArgs,
  driveDeviceReversePorts,
  ensureAdbReverses,
  adbOpenDevClientArgs,
  adbShellHttpGetArgs,
  adbShellCookieGetCommands,
  adbShellHttpCookieGetArgs,
  adbLogcatDumpArgs,
  adbPidofArgs,
  parseAdbPid,
  deviceE2ESessionUrl,
  e2eAuthCookieHeader,
  mobileExpoOrigin,
  mobileE2ESignInHeaders,
  apiUrlDevTag,
  bundleHasApiUrlTag,
  listedExpoPublicApiUrls,
  foundApiUrlDevTags,
  clientApiUrlFromBundle,
  bundleApiUrlMissMessage,
  upsertDotenvKeys,
  stampMobileExpoPublicEnv,
  restoreMobileExpoPublicEnv,
  E2E_AUTH_HEADER,
  E2E_GET_SESSION_METHOD,
  e2eSessionLooksReady,
  e2eSessionBodySummary,
  formatPreflightStage,
  formatDevicePreflightStage,
  DEVICE_PREFLIGHT_SKIP,
  maestroRunningStage,
  verifyDevicePassStage,
  verifyDeviceFailStage,
  summarizeAuthFailure,
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
  ownedVerifyListenPorts,
  metroPortClaim,
  shouldRebuildApk,
  shouldClearAndroidBuildCache,
  ownedDevicePackage,
  shouldUninstallStalePackage,
  shouldUninstallRecordedPackage,
  resolveEmulatorAttachment,
  serialWaitTick,
  waitForSerialReady,
  waitForSerialGone,
  waitForPortFree,
  adbEmuKillArgs,
  pidGoneTick,
  stopSignalTick,
  parseLockPid,
  avdLockPaths,
  avdLockTick,
  parseEmulatorAvdPids,
  avdBusyMessage,
  waitForPidGone,
  stopPidAndWait,
  waitForAvdLocksReleased,
  ensureAvdFreeToBoot,
  portFreeTick,
  verifyDevicePlan,
  verifyDeviceHeadline,
  deviceReadyProblems,
  maestroDeviceArgs,
  maestroCheckSyntaxArgs,
  resolveMaestroBin,
  listMaestroFlowPaths,
  inspectMaestroFlows,
  maestroSyntaxRequired,
  HARNESS_MAESTRO,
  HARNESS_RNTL,
  maestroLogPath,
  maestroLogTail,
  parseMaestroFailedStep,
  maestroFailureMessage,
  DEVICE_SERIAL,
  AVD_NAME,
  DEFAULT_DEVICE_WEB_PORT,
  E2E_USER_WITH_DATA,
  ANDROID_PACKAGE,
  SIGN_IN_TEST_ID,
  DEV_MENU_CONTINUE_TEXT,
  DEV_MENU_CLOSE_TEXT,
  DEV_CLIENT_DISABLE_AUTO_LAUNCH,
  DEV_CLIENT_DISABLE_ONBOARDING,
  AM_START_ALREADY_FOREGROUND,
  DEVICE_FAILURE_SCREENSHOT,
  DEVICE_FAILURE_DUMP,
  DEVICE_FAILURE_WEB_LOG,
  DEVICE_FAILURE_LOGCAT,
  MAESTRO_LOG_NAME,
  DEFAULT_VERIFY_DEVICE_FLOW,
} from './control.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..')

function maestroCliAvailable() {
  const bin = resolveMaestroBin()
  if (bin !== 'maestro' && !existsSync(bin)) return false
  const result = spawnSync(bin, ['--version'], {
    encoding: 'utf8',
    timeout: 30_000,
  })
  return !result.error && result.status === 0
}

function mobileDepsInstalled() {
  try {
    createRequire(join(repoRoot, 'apps/mobile/package.json')).resolve(
      '@better-auth/expo',
    )
    return true
  } catch {
    return false
  }
}

const hasMaestro = maestroCliAvailable()
const hasMobileDeps = mobileDepsInstalled()

function writeSdkTree(root, { systemImages = true } = {}) {
  mkdirSync(join(root, 'emulator'), { recursive: true })
  writeFileSync(join(root, 'emulator', 'emulator'), '')
  mkdirSync(join(root, 'platform-tools'), { recursive: true })
  writeFileSync(join(root, 'platform-tools', 'adb'), '')
  if (systemImages) mkdirSync(join(root, 'system-images'), { recursive: true })
}

describe('parseAdbDevices', () => {
  it('reads attached serials and ignores the header', () => {
    const devices = parseAdbDevices(`List of devices attached
${DEVICE_SERIAL}\tdevice
emulator-5556\toffline
`)
    assert.deepEqual(devices, [
      { serial: DEVICE_SERIAL, state: 'device' },
      { serial: 'emulator-5556', state: 'offline' },
    ])
  })
})

describe('parseDumpsysVersionName', () => {
  it('reads versionName from dumpsys package', () => {
    assert.equal(
      parseDumpsysVersionName(
        'Packages:\n  Package [dev.offbyonelabs.coffeecompanion]\n    versionName=abc1234\n    versionCode=1\n',
      ),
      'abc1234',
    )
  })

  it('returns null when versionName is missing', () => {
    assert.equal(parseDumpsysVersionName('Packages:\n'), null)
  })
})

describe('parseAvdName', () => {
  it('reads the first line from adb emu avd name', () => {
    assert.equal(parseAvdName(`${AVD_NAME}\n`), AVD_NAME)
  })
})

describe('parseEmulatorAvdList', () => {
  it('reads installed AVD names and skips blank and log lines', () => {
    const names = parseEmulatorAvdList(`INFO    | Storing crashdata in: /tmp/android
Pixel_10_Pro_XL
Pixel_6
Pixel_7

`)
    assert.deepEqual(names, ['Pixel_10_Pro_XL', 'Pixel_6', 'Pixel_7'])
  })
})

describe('chosenAvdName', () => {
  it('defaults to verify-pixel when VERIFY_AVD is unset', () => {
    assert.equal(chosenAvdName({}), AVD_NAME)
  })

  it('uses VERIFY_AVD when it is set', () => {
    assert.equal(chosenAvdName({ VERIFY_AVD: 'Pixel_7' }), 'Pixel_7')
  })
})

describe('requireAvd', () => {
  it('fails immediately when the chosen AVD is missing, listing what is installed', () => {
    assert.throws(
      () =>
        requireAvd('verify-pixel', ['Pixel_10_Pro_XL', 'Pixel_6', 'Pixel_7']),
      (error) => {
        assert.match(error.message, /verify-pixel/)
        assert.match(error.message, /Pixel_10_Pro_XL, Pixel_6, Pixel_7/)
        assert.match(error.message, /VERIFY_AVD/)
        return true
      },
    )
  })

  it('returns the chosen name when it is installed', () => {
    assert.equal(
      requireAvd('Pixel_7', ['Pixel_10_Pro_XL', 'Pixel_6', 'Pixel_7']),
      'Pixel_7',
    )
  })
})

describe('bootWaitTick', () => {
  it('fails immediately when the emulator process has already exited', () => {
    const tick = bootWaitTick({
      alive: false,
      bootCompleted: false,
      logText: 'PANIC: Cannot find AVD system path\nINFO    | shutting down\n',
    })
    assert.equal(tick.status, 'error')
    assert.match(tick.error, /exited before boot/)
    assert.match(tick.error, /PANIC: Cannot find AVD system path/)
  })

  it('waits while the emulator is alive and not yet booted', () => {
    const tick = bootWaitTick({
      alive: true,
      bootCompleted: false,
      logText: '',
    })
    assert.equal(tick.status, 'wait')
  })

  it('succeeds when boot_completed is set', () => {
    const tick = bootWaitTick({
      alive: true,
      bootCompleted: true,
      logText: '',
    })
    assert.equal(tick.status, 'ok')
  })
})

describe('expoAndroidArgs', () => {
  it('passes the AVD name to expo --device, not the adb serial', () => {
    const args = expoAndroidArgs('Pixel_7')
    const deviceAt = args.indexOf('--device')
    assert.ok(deviceAt >= 0)
    assert.equal(args[deviceAt + 1], 'Pixel_7')
    assert.ok(!args.includes(DEVICE_SERIAL))
    assert.ok(args.includes('--no-bundler'))
    assert.ok(!args.includes('--port'))
  })

  it('clears the native build cache when the installed APK is stale', () => {
    const args = expoAndroidArgs('Pixel_7', { noBuildCache: true })
    assert.ok(args.includes('--no-build-cache'))
    assert.ok(args.includes('--no-bundler'))
    assert.ok(!args.includes('--port'))
  })

  it('rebuilds a missing APK without clearing the Gradle cache', () => {
    const args = expoAndroidArgs('Pixel_7', { noBuildCache: false })
    assert.ok(!args.includes('--no-build-cache'))
    assert.ok(args.includes('--no-bundler'))
  })
})

describe('metroStartArgs', () => {
  it('starts a non-interactive dev-client Metro from apps/mobile without --localhost', () => {
    const args = metroStartArgs(8081, { clearCache: true, devClient: true })
    assert.deepEqual(args, [
      'exec',
      'expo',
      'start',
      '--port',
      '8081',
      '--dev-client',
      '--clear',
    ])
    assert.ok(!args.includes('--localhost'))
    assert.ok(!args.includes('--android'))
    assert.ok(!args.includes('--android=false'))
  })

  it('spawns from apps/mobile with CI=1 so Expo does not take a TTY', () => {
    const spec = metroSpawnSpec(8081, {
      clearCache: true,
      devClient: true,
      extraEnv: { EXPO_PUBLIC_API_URL: 'http://127.0.0.1:3910' },
    })
    assert.equal(spec.command, 'pnpm')
    assert.ok(spec.cwd.endsWith('apps/mobile'))
    assert.equal(spec.env.CI, '1')
    assert.equal(spec.env.EXPO_PUBLIC_API_URL, 'http://127.0.0.1:3910')
  })
})

describe('metro readiness wait', () => {
  it('probes IPv4 and IPv6 loopback, not only localhost', () => {
    assert.deepEqual(metroStatusUrls(8081), [
      'http://127.0.0.1:8081/status',
      'http://[::1]:8081/status',
      'http://localhost:8081/status',
    ])
  })

  it('succeeds once /status is packager-status:running', () => {
    const tick = metroWaitTick({
      alive: true,
      ready: true,
      logText: '',
    })
    assert.equal(tick.status, 'ok')
  })

  it('fails with the Metro log tail when the process exits before ready', () => {
    const tick = metroWaitTick({
      alive: false,
      ready: false,
      logText: 'Error: listen EADDRINUSE: address already in use :::8081\n',
    })
    assert.equal(tick.status, 'error')
    assert.match(tick.error, /exited before/)
    assert.match(tick.error, /EADDRINUSE/)
  })

  it('waits while Metro is alive and /status is not ready', () => {
    const tick = metroWaitTick({
      alive: true,
      ready: false,
      logText: '',
    })
    assert.equal(tick.status, 'wait')
  })

  it('names an empty metro.log on timeout', () => {
    assert.match(metroTimeoutError({ port: 8081, logText: '' }), /8081/)
    assert.match(metroTimeoutError({ port: 8081, logText: '' }), /empty/)
    assert.match(metroDiedError(''), /empty/)
  })
})

describe('dev-client bundle URL', () => {
  it('asks Metro for the workspace /apps/mobile/index.bundle the dev client loads', () => {
    assert.equal(
      BUNDLE_PATHS[0],
      '/apps/mobile/index.bundle?platform=android&dev=true&minify=false&lazy=false',
    )
    assert.ok(
      BUNDLE_PATHS.includes(
        '/index.bundle?platform=android&dev=true&minify=false&lazy=false',
      ),
    )
    assert.ok(
      BUNDLE_PATHS.includes(
        '/.expo/.virtual-metro-entry.bundle?platform=android&dev=true&minify=false&lazy=false',
      ),
    )
  })
})

describe('installWaitTick', () => {
  it('fails immediately when expo has already exited', () => {
    const tick = installWaitTick({
      alive: false,
      versionName: null,
      logText:
        'CommandError: Could not find device with name: emulator-5554\n',
    })
    assert.equal(tick.status, 'error')
    assert.match(tick.error, /exited before/)
    assert.match(tick.error, /Could not find device with name: emulator-5554/)
  })

  it('waits while expo is alive and the package is not installed', () => {
    const tick = installWaitTick({
      alive: true,
      versionName: null,
      logText: '',
    })
    assert.equal(tick.status, 'wait')
  })

  it('succeeds when the package versionName is present', () => {
    const tick = installWaitTick({
      alive: true,
      versionName: 'abc1234',
      logText: '',
    })
    assert.equal(tick.status, 'ok')
  })

  it('waits when the installed versionName is stale and Gradle is still running', () => {
    const tick = installWaitTick({
      alive: true,
      versionName: 'e0543f5',
      expectedVersion: '4bf1a18',
      logText: '',
    })
    assert.equal(tick.status, 'wait')
    assert.match(tick.reason, /e0543f5/)
    assert.match(tick.reason, /4bf1a18/)
  })

  it('fails when BUILD SUCCESSFUL left a stale versionName even if expo is still alive', () => {
    const tick = installWaitTick({
      alive: true,
      versionName: 'e0543f5',
      expectedVersion: '4bf1a18',
      logText: 'BUILD SUCCESSFUL in 6s\nOpening exp+coffee-companion://\n',
    })
    assert.equal(tick.status, 'error')
    assert.match(tick.error, /e0543f5/)
    assert.match(tick.error, /4bf1a18/)
    assert.match(tick.error, /UP-TO-DATE/)
  })

  it('fails when expo exits still serving a stale APK', () => {
    const tick = installWaitTick({
      alive: false,
      versionName: 'e0543f5',
      expectedVersion: '4bf1a18',
      logText: '',
    })
    assert.equal(tick.status, 'error')
    assert.match(tick.error, /e0543f5/)
    assert.match(tick.error, /4bf1a18/)
  })

  it('succeeds when the installed versionName matches git HEAD', () => {
    const tick = installWaitTick({
      alive: true,
      versionName: '4bf1a18',
      expectedVersion: '4bf1a18',
      logText: '',
    })
    assert.equal(tick.status, 'ok')
  })

  it('waits after expo --no-bundler exits once BUILD SUCCESSFUL until dumpsys sees the package', () => {
    const tick = installWaitTick({
      alive: false,
      versionName: null,
      expectedVersion: '4bf1a18',
      logText: 'BUILD SUCCESSFUL in 6s\n',
    })
    assert.equal(tick.status, 'wait')
  })
})

describe('resolveSdkRoot', () => {
  it('prefers ANDROID_HOME, then ANDROID_SDK_ROOT, then the Studio default, and skips Homebrew commandlinetools', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'verify-sdk-'))
    const homebrew = join(tmp, 'opt', 'homebrew', 'share', 'android-commandlinetools')
    const envHome = join(tmp, 'opt', 'android-sdk')
    const sdkRoot = join(tmp, 'sdk-root')
    const studioMac = join(tmp, 'Library', 'Android', 'sdk')
    const studioLinux = join(tmp, 'Android', 'Sdk')
    try {
      writeSdkTree(homebrew)
      writeSdkTree(envHome)
      writeSdkTree(sdkRoot)
      writeSdkTree(studioMac)
      writeSdkTree(studioLinux)

      assert.equal(
        resolveSdkRoot({
          env: { ANDROID_HOME: envHome, ANDROID_SDK_ROOT: sdkRoot },
          home: tmp,
          platform: 'darwin',
        }),
        envHome,
      )
      assert.equal(
        resolveSdkRoot({
          env: { ANDROID_SDK_ROOT: sdkRoot },
          home: tmp,
          platform: 'darwin',
        }),
        sdkRoot,
      )
      assert.equal(
        resolveSdkRoot({
          env: { ANDROID_HOME: homebrew },
          home: tmp,
          platform: 'darwin',
        }),
        studioMac,
      )
      assert.equal(
        resolveSdkRoot({ env: {}, home: tmp, platform: 'linux' }),
        studioLinux,
      )
      const incomplete = join(tmp, 'incomplete-sdk')
      writeSdkTree(incomplete, { systemImages: false })
      assert.equal(
        resolveSdkRoot({
          env: { ANDROID_HOME: incomplete },
          home: join(tmp, 'no-home'),
          platform: 'linux',
        }),
        null,
      )
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})

describe('chosenEmulatorGpu', () => {
  it('defaults to host on macOS and honors VERIFY_EMULATOR_GPU', () => {
    assert.equal(chosenEmulatorGpu({}, 'darwin'), 'host')
    assert.equal(
      chosenEmulatorGpu({ VERIFY_EMULATOR_GPU: 'swiftshader_indirect' }, 'darwin'),
      'swiftshader_indirect',
    )
  })
})

describe('emulatorLaunchArgs', () => {
  it('matches Studio-style host GPU and does not force a cold boot', () => {
    const args = emulatorLaunchArgs('Pixel_7', 'host')
    assert.deepEqual(args, [
      '-avd',
      'Pixel_7',
      '-port',
      '5554',
      '-no-boot-anim',
      '-gpu',
      'host',
    ])
    assert.ok(!args.includes('-no-snapshot-save'))
    assert.ok(!args.includes('-no-snapshot-load'))
    assert.ok(!args.includes('-no-snapshot'))
    assert.ok(!args.includes('-read-only'))
  })
})

describe('parseJavaMajor', () => {
  it('reads modern and 1.8 version lines', () => {
    assert.equal(parseJavaMajor('openjdk version "17.0.13" 2024-10-15'), 17)
    assert.equal(parseJavaMajor('openjdk version "25.0.1" 2025-10-21'), 25)
    assert.equal(parseJavaMajor('java version "1.8.0_392"'), 8)
  })
})

describe('resolveGradleJava', () => {
  it('keeps a JDK 17 JAVA_HOME', () => {
    const found = resolveGradleJava({
      env: { JAVA_HOME: '/opt/java17' },
      platform: 'darwin',
      readJavaVersion: () => 'openjdk version "17.0.13"',
    })
    assert.equal(found.javaHome, '/opt/java17')
    assert.equal(found.major, 17)
  })

  it('falls back to macOS java_home 17 when JAVA_HOME is Java 25', () => {
    const found = resolveGradleJava({
      env: { JAVA_HOME: '/opt/jbr-25' },
      platform: 'darwin',
      readJavaVersion: () => 'openjdk version "25.0.1"',
      lookupMacJavaHome: () => '/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home',
    })
    assert.equal(
      found.javaHome,
      '/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home',
    )
    assert.equal(found.major, 17)
  })

  it('fails with install guidance when no Java 17 is available', () => {
    assert.throws(
      () =>
        resolveGradleJava({
          env: { JAVA_HOME: '/opt/jbr-25' },
          platform: 'darwin',
          readJavaVersion: () => 'openjdk version "25.0.1"',
          lookupMacJavaHome: () => '',
        }),
      (error) => {
        assert.match(error.message, /25/)
        assert.match(error.message, /17/)
        return true
      },
    )
  })
})

describe('chosenDeviceWebPort', () => {
  it('defaults to 3910 so it does not collide with pnpm dev on 3000', () => {
    assert.equal(chosenDeviceWebPort({}), DEFAULT_DEVICE_WEB_PORT)
    assert.equal(DEFAULT_DEVICE_WEB_PORT, 3910)
    assert.notEqual(DEFAULT_DEVICE_WEB_PORT, 3000)
  })

  it('uses VERIFY_PORT when it is set', () => {
    assert.equal(chosenDeviceWebPort({ VERIFY_PORT: '4010' }), 4010)
  })

  it('rejects ports above 65535 before the emulator starts', () => {
    assert.throws(
      () => chosenDeviceWebPort({ VERIFY_PORT: '65536' }),
      /TCP port 1–65535/,
    )
  })
})

describe('deviceApiUrl', () => {
  it('uses 127.0.0.1 so the bundle hits the web server through adb reverse', () => {
    assert.equal(deviceApiUrl(3910), 'http://127.0.0.1:3910')
  })
})

describe('deviceExpoPublicEnv', () => {
  it('sets EXPO_PUBLIC_API_URL so Metro inlines the dedicated port', () => {
    const env = deviceExpoPublicEnv(3910)
    assert.equal(env.EXPO_PUBLIC_API_URL, 'http://127.0.0.1:3910')
    assert.equal(env.EXPO_PUBLIC_E2E_USER, E2E_USER_WITH_DATA)
  })
})

describe('webLaunchEnv', () => {
  it('pins VERIFY_PORT, Better Auth, and the e2e bypass flag to the dedicated port', () => {
    const env = webLaunchEnv(3910)
    assert.equal(env.VERIFY_PORT, '3910')
    assert.equal(env.BETTER_AUTH_URL, 'http://127.0.0.1:3910')
    assert.equal(env.SITE_URL, 'http://127.0.0.1:3910')
    assert.equal(env.HOST, '127.0.0.1')
    assert.equal(env.NITRO_HOST, '127.0.0.1')
    assert.equal(env.E2E_BYPASS_AUTH, 'true')
    assert.equal(
      Object.hasOwn(env, 'NODE_ENV'),
      false,
      'NODE_ENV must stay unset on webLaunchEnv; the web launch pins production on pnpm build and test on the spawned server',
    )
  })
})

describe('device E2E session preflight', () => {
  it('builds the get-session URL on the reversed loopback', () => {
    assert.equal(
      deviceE2ESessionUrl(3910),
      'http://127.0.0.1:3910/api/auth/get-session',
    )
    assert.equal(e2eAuthCookieHeader(), `Cookie: e2e_auth=${E2E_USER_WITH_DATA}`)
    assert.equal(e2eSessionLooksReady(`{"user":{"id":"${E2E_USER_WITH_DATA}"}}`), true)
    assert.equal(e2eSessionLooksReady('null'), false)
    assert.equal(e2eSessionLooksReady('{"user":null}'), false)
    assert.equal(e2eSessionBodySummary('null'), 'null')
    assert.equal(e2eSessionBodySummary(''), 'empty')
    assert.equal(
      e2eSessionBodySummary(`{"user":{"id":"${E2E_USER_WITH_DATA}"}}`),
      E2E_USER_WITH_DATA,
    )
  })

  it('sends the same method, path, and headers as native E2E get-session', () => {
    assert.equal(E2E_GET_SESSION_METHOD, 'GET')
    assert.equal(E2E_AUTH_HEADER, 'x-e2e-auth')
    assert.equal(mobileExpoOrigin(8081), 'coffeecompanion:///127.0.0.1:8081')
    assert.deepEqual(mobileE2ESignInHeaders({ expoOrigin: mobileExpoOrigin(8081) }), {
      cookie: `e2e_auth=${E2E_USER_WITH_DATA}`,
      [E2E_AUTH_HEADER]: E2E_USER_WITH_DATA,
      'expo-origin': 'coffeecompanion:///127.0.0.1:8081',
      'x-skip-oauth-proxy': 'true',
    })
  })

  it('requires the cc-api-url tag, not only extra.apiUrl in the bundle', () => {
    const apiUrl = 'http://127.0.0.1:3910'
    assert.equal(apiUrlDevTag(apiUrl), 'cc-api-url:http://127.0.0.1:3910')
    assert.equal(
      bundleHasApiUrlTag(`var x = "cc-api-url:${apiUrl}"`, apiUrl),
      true,
    )
    assert.equal(
      bundleHasApiUrlTag(`extra:{apiUrl:"${apiUrl}"}`, apiUrl),
      false,
    )
    assert.equal(
      bundleHasApiUrlTag(`"cc-api-url:" + "${apiUrl}"`, apiUrl),
      true,
    )
    assert.equal(
      bundleHasApiUrlTag('`cc-api-url:${"http://127.0.0.1:3910"}`', apiUrl),
      true,
    )
  })

  it('reads the client EXPO_PUBLIC_API_URL from the serializer polyfill or .env overlay', () => {
    const apiUrl = 'http://127.0.0.1:3910'
    const serializer =
      '/* HMR env vars from Expo CLI (dev-only) */ process.env=Object.defineProperties(process.env, {"EXPO_PUBLIC_API_URL": { enumerable: true, value: "http://127.0.0.1:3910" }});'
    const prefixAndSerializer = `var tag = "cc-api-url:" + env.EXPO_PUBLIC_API_URL;\n${serializer}`
    assert.equal(clientApiUrlFromBundle(serializer), apiUrl)
    assert.equal(bundleHasApiUrlTag(prefixAndSerializer, apiUrl), true)
    assert.equal(
      clientApiUrlFromBundle('EXPO_PUBLIC_API_URL=http://localhost:3000\nEXPO_PUBLIC_API_URL=http://127.0.0.1:3910'),
      apiUrl,
    )
    assert.deepEqual(listedExpoPublicApiUrls(serializer), [apiUrl])
    assert.equal(
      listedExpoPublicApiUrls(`extra:{apiUrl:"${apiUrl}"}`).includes(apiUrl),
      false,
    )
    assert.deepEqual(foundApiUrlDevTags('var x = "cc-api-url:" + env.EXPO_PUBLIC_API_URL'), [
      'cc-api-url:',
    ])
  })

  it('names the inlined EXPO_PUBLIC_API_URL when the expected tag is missing', () => {
    const expected = 'http://127.0.0.1:3910'
    const body =
      'var tag = "cc-api-url:" + env.EXPO_PUBLIC_API_URL;\nprocess.env=Object.defineProperties(process.env, {"EXPO_PUBLIC_API_URL": { enumerable: true, value: "http://localhost:3000" }});'
    const message = bundleApiUrlMissMessage(
      body,
      'http://[::1]:8081/apps/mobile/index.bundle?platform=android&dev=true&minify=false&lazy=false',
      expected,
    )
    assert.match(message, /\/apps\/mobile\/index\.bundle/)
    assert.match(message, /cc-api-url:http:\/\/127\.0\.0\.1:3910/)
    assert.match(message, /EXPO_PUBLIC_API_URL is inlined as http:\/\/localhost:3000/)
    assert.match(message, /found cc-api-url:/)
    assert.equal(
      bundleApiUrlMissMessage('', 'http://127.0.0.1:8081/apps/mobile/index.bundle', expected),
      'bundle at http://127.0.0.1:8081/apps/mobile/index.bundle does not mention cc-api-url:http://127.0.0.1:3910; EXPO_PUBLIC_API_URL was not inlined; no cc-api-url: tag',
    )
  })
})

describe('stampMobileExpoPublicEnv', () => {
  it('upserts EXPO_PUBLIC_* into .env.development.local so expo/virtual/env cannot keep .env', () => {
    assert.equal(
      upsertDotenvKeys('EXPO_PUBLIC_API_URL=http://localhost:3000\nKEEP=1\n', {
        EXPO_PUBLIC_API_URL: 'http://127.0.0.1:3910',
        EXPO_PUBLIC_E2E_USER: 'e2e-user-with-data',
      }),
      'EXPO_PUBLIC_API_URL=http://127.0.0.1:3910\nKEEP=1\nEXPO_PUBLIC_E2E_USER=e2e-user-with-data\n',
    )
    const root = mkdtempSync(join(tmpdir(), 'cc-dotenv-'))
    const dotenvPath = join(root, '.env.development.local')
    const backupDir = join(root, 'run')
    try {
      writeFileSync(dotenvPath, 'EXPO_PUBLIC_API_URL=http://localhost:3000\n')
      stampMobileExpoPublicEnv(
        {
          EXPO_PUBLIC_API_URL: 'http://127.0.0.1:3910',
          EXPO_PUBLIC_E2E_USER: 'e2e-user-with-data',
          OTHER: 'skip',
        },
        { dotenvPath, backupDir },
      )
      assert.match(
        readFileSync(dotenvPath, 'utf8'),
        /EXPO_PUBLIC_API_URL=http:\/\/127\.0\.0\.1:3910/,
      )
      assert.equal(
        readFileSync(dotenvPath, 'utf8').includes('OTHER='),
        false,
      )
      restoreMobileExpoPublicEnv({ dotenvPath, backupDir })
      assert.equal(
        readFileSync(dotenvPath, 'utf8'),
        'EXPO_PUBLIC_API_URL=http://localhost:3000\n',
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('deletes a helper-created .env.development.local and leaves a missing file missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'cc-dotenv-new-'))
    const dotenvPath = join(root, '.env.development.local')
    const backupDir = join(root, 'run')
    try {
      stampMobileExpoPublicEnv(
        { EXPO_PUBLIC_API_URL: 'http://127.0.0.1:3910' },
        { dotenvPath, backupDir },
      )
      assert.equal(existsSync(dotenvPath), true)
      restoreMobileExpoPublicEnv({ dotenvPath, backupDir })
      assert.equal(existsSync(dotenvPath), false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('keeps the first backup when stamp runs twice so a user file is not clobbered', () => {
    const root = mkdtempSync(join(tmpdir(), 'cc-dotenv-twice-'))
    const dotenvPath = join(root, '.env.development.local')
    const backupDir = join(root, 'run')
    try {
      writeFileSync(dotenvPath, 'EXPO_PUBLIC_API_URL=http://localhost:3000\n')
      stampMobileExpoPublicEnv(
        { EXPO_PUBLIC_API_URL: 'http://127.0.0.1:3910' },
        { dotenvPath, backupDir },
      )
      stampMobileExpoPublicEnv(
        { EXPO_PUBLIC_API_URL: 'http://127.0.0.1:9999' },
        { dotenvPath, backupDir },
      )
      restoreMobileExpoPublicEnv({ dotenvPath, backupDir })
      assert.equal(
        readFileSync(dotenvPath, 'utf8'),
        'EXPO_PUBLIC_API_URL=http://localhost:3000\n',
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('verify-device stages', () => {
  it('names host/device preflight, Maestro start, and PASS/FAIL', () => {
    assert.equal(
      formatPreflightStage('host', {
        ok: true,
        body: `{"user":{"id":"${E2E_USER_WITH_DATA}"}}`,
      }),
      `preflight host OK (${E2E_USER_WITH_DATA})`,
    )
    assert.equal(
      formatDevicePreflightStage({ checked: false, body: null }),
      DEVICE_PREFLIGHT_SKIP,
    )
    assert.equal(
      DEVICE_PREFLIGHT_SKIP,
      'preflight device SKIP (no http client on device)',
    )
    assert.equal(
      formatDevicePreflightStage({ checked: true, body: 'null' }),
      'preflight device WARN (null)',
    )
    assert.equal(
      formatDevicePreflightStage({
        checked: true,
        body: `{"user":{"id":"${E2E_USER_WITH_DATA}"}}`,
      }),
      `preflight device OK (${E2E_USER_WITH_DATA})`,
    )
    assert.equal(
      maestroRunningStage('sign-in-and-out'),
      'Running Maestro flow sign-in-and-out',
    )
    assert.equal(
      verifyDevicePassStage('/tmp/artifacts/run/sign-in-and-out'),
      'PASS artifacts at /tmp/artifacts/run/sign-in-and-out',
    )
    assert.equal(verifyDeviceFailStage('body=null'), 'FAIL body=null')
  })
})

describe('missingStateMessage', () => {
  it('mentions both the RNTL launch and the device-tier launch', () => {
    const message = missingStateMessage()
    assert.match(message, /`helpers\/control launch`/)
    assert.match(message, /`helpers\/control launch-device`/)
  })
})

describe('recordedPids', () => {
  it('collects only pids written in state', () => {
    const pids = recordedPids({
      metroPid: 11,
      metroPids: [11, 12],
      emulatorPid: 21,
      webPid: 31,
      expoPid: 41,
    })
    assert.deepEqual([...pids].sort((a, b) => a - b), [11, 12, 21, 31, 41])
  })
})

describe('copyPngFiles', () => {
  it('copies pngs and leaves other files', () => {
    const from = mkdtempSync(join(tmpdir(), 'verify-from-'))
    const dest = mkdtempSync(join(tmpdir(), 'verify-dest-'))
    try {
      writeFileSync(join(from, 'signed-in.png'), 'png')
      writeFileSync(join(from, 'notes.txt'), 'no')
      const copied = copyPngFiles(from, dest)
      assert.equal(copied.length, 1)
      assert.equal(readFileSync(join(dest, 'signed-in.png'), 'utf8'), 'png')
      assert.equal(
        copied[0].endsWith('signed-in.png'),
        true,
      )
    } finally {
      rmSync(from, { recursive: true, force: true })
      rmSync(dest, { recursive: true, force: true })
    }
  })
})

describe('parseExpoPackageImports', () => {
  it('reads static, dynamic, and require specifiers', () => {
    const source = `
      import Constants from "expo-constants";
      import * as Linking from 'expo-linking';
      import("expo-network").then(({ addNetworkStateListener }) => {});
      const Browser = require("expo-web-browser");
    `
    assert.deepEqual(parseExpoPackageImports(source), [
      'expo-constants',
      'expo-linking',
      'expo-network',
      'expo-web-browser',
    ])
  })

  it('does not treat scoped Expo packages or subpaths as package names', () => {
    assert.deepEqual(
      parseExpoPackageImports(`import x from '@expo/vector-icons'; import y from 'expo/fetch'`),
      [],
    )
  })
})

describe('parseAutolinkedPackageNames', () => {
  it('reads packageName from expo-modules-autolinking resolve JSON', () => {
    const names = parseAutolinkedPackageNames({
      modules: [
        { packageName: 'expo-constants' },
        { packageName: 'expo-secure-store' },
        { packageName: null },
      ],
    })
    assert.deepEqual(names, ['expo-constants', 'expo-secure-store'])
  })
})

describe('missingAutolinkedExpoModules', () => {
  it('flags expo-network when JS imports it but autolinking omitted it', () => {
    assert.deepEqual(
      missingAutolinkedExpoModules({
        imported: ['expo-constants', 'expo-network'],
        linked: ['expo-constants'],
        treatAsNative: (name) =>
          name === 'expo-network' || name === 'expo-constants',
      }),
      ['expo-network'],
    )
  })

  it('ignores a JS-only package that is not a native module', () => {
    assert.deepEqual(
      missingAutolinkedExpoModules({
        imported: ['expo-something-js'],
        linked: [],
        treatAsNative: () => false,
      }),
      [],
    )
  })
})

describe('collectImportedExpoPackages', () => {
  it('walks source files and skips node_modules', () => {
    const root = mkdtempSync(join(tmpdir(), 'verify-autolink-'))
    try {
      mkdirSync(join(root, 'src'), { recursive: true })
      mkdirSync(join(root, 'node_modules', 'other'), { recursive: true })
      writeFileSync(
        join(root, 'src', 'client.js'),
        'import("expo-network").then(() => {})\n',
      )
      writeFileSync(
        join(root, 'node_modules', 'other', 'ignored.js'),
        'import "expo-file-system"\n',
      )
      assert.deepEqual(collectImportedExpoPackages([root]), ['expo-network'])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('expoModuleSupportsPlatform', () => {
  it('does not treat an apple-only module as android-native', () => {
    assert.equal(
      expoModuleSupportsPlatform({ platforms: ['apple'] }, 'android'),
      false,
    )
    assert.equal(
      expoModuleSupportsPlatform(
        { platforms: ['apple', 'android'] },
        'android',
      ),
      true,
    )
  })
})

describe('inspectExpoAutolinking', () => {
  it('reports a problem that tells you to expo install the missing module', () => {
    const report = inspectExpoAutolinking({
      imported: ['expo-network'],
      linked: ['expo-constants'],
      treatAsNative: () => true,
    })
    assert.deepEqual(report.missing, ['expo-network'])
    assert.equal(report.ok, undefined)
    assert.equal(report.problems.length, 1)
    assert.match(report.problems[0], /expo-network/)
    assert.match(report.problems[0], /npx expo install expo-network/)
    assert.match(report.problems[0], /pnpm/)
  })

  it('finds expo-network from @better-auth/expo and requires it to be autolinked', { skip: !hasMobileDeps }, () => {
    const report = inspectExpoAutolinking()
    assert.ok(
      report.imported.includes('expo-network'),
      `imported ${report.imported.join(', ')}`,
    )
    assert.ok(
      report.linked.includes('expo-network'),
      `linked ${report.linked.join(', ')}; problems: ${report.problems.join('; ')}`,
    )
    assert.deepEqual(report.missing, [])
    assert.deepEqual(report.problems, [])
  })
})

describe('parseAppScheme', () => {
  it('reads scheme from app.config.ts and app.json', () => {
    assert.equal(parseAppScheme("scheme: 'coffeecompanion',\n"), 'coffeecompanion')
    assert.equal(parseAppScheme('{ "scheme": "myapp" }'), 'myapp')
  })
})

describe('parseAppSlug', () => {
  it('reads slug from app.config.ts', () => {
    assert.equal(parseAppSlug("slug: 'coffee-companion',\n"), 'coffee-companion')
  })
})

describe('expoDevClientScheme', () => {
  it('matches the exp+<slug> scheme Expo opens after install', () => {
    assert.equal(
      expoDevClientScheme({ slug: 'coffee-companion', scheme: 'coffeecompanion' }),
      'exp+coffee-companion',
    )
  })
})

describe('readAppScheme', () => {
  it('reads the scheme from the mobile app config', () => {
    assert.equal(readAppScheme(), 'coffeecompanion')
  })
})

describe('readDevClientScheme', () => {
  it('reads exp+<slug> from the mobile app config', () => {
    assert.equal(readDevClientScheme(), 'exp+coffee-companion')
  })
})

describe('expoDevClientUrl', () => {
  it('encodes the Metro loopback URL and Expo 57 disableAutoLaunch flags', () => {
    const url = expoDevClientUrl({ scheme: 'exp+coffee-companion', metroPort: 8081 })
    assert.match(url, /^exp\+coffee-companion:\/\/expo-development-client\/\?url=/)
    assert.match(url, /url=http%3A%2F%2F127\.0\.0\.1%3A8081/)
    assert.match(url, new RegExp(DEV_CLIENT_DISABLE_AUTO_LAUNCH))
    assert.match(url, new RegExp(DEV_CLIENT_DISABLE_ONBOARDING))
    assert.equal(
      url,
      'exp+coffee-companion://expo-development-client/' +
        `?url=http%3A%2F%2F127.0.0.1%3A8081&${DEV_CLIENT_DISABLE_AUTO_LAUNCH}&${DEV_CLIENT_DISABLE_ONBOARDING}`,
    )
  })
})

describe('gradleBuildFinished', () => {
  it('detects BUILD SUCCESSFUL in the expo android log', () => {
    assert.equal(gradleBuildFinished('BUILD SUCCESSFUL in 6s\n'), true)
    assert.equal(gradleBuildFinished('> Task :app:packageDebug\n'), false)
  })
})

describe('installWaitReason', () => {
  it('names the actual and expected versionName', () => {
    assert.match(
      installWaitReason({
        versionName: 'e0543f5',
        expectedVersion: '4bf1a18',
      }),
      /e0543f5/,
    )
  })
})

describe('installTimeoutError', () => {
  it('names the actual versionName versus the expected SHA', () => {
    const message = installTimeoutError({
      pkg: ANDROID_PACKAGE,
      serial: DEVICE_SERIAL,
      versionName: 'e0543f5',
      expectedVersion: '4bf1a18',
    })
    assert.match(message, /e0543f5/)
    assert.match(message, /4bf1a18/)
    assert.match(message, /Timed out/)
  })
})

describe('stampDevMenuManifest', () => {
  it('sets EXDevMenuShowsAtLaunch false so the menu does not auto-open', () => {
    const stamped = stampDevMenuManifest(
      '<manifest><application android:name=".MainApplication"></application></manifest>',
    )
    assert.match(stamped, /EXDevMenuShowsAtLaunch" android:value="false"/)
    assert.match(stamped, /EXDevMenuIsOnboardingFinished" android:value="true"/)
    assert.match(
      stampDevMenuManifest(
        '<application><meta-data android:name="EXDevMenuShowsAtLaunch" android:value="true"/></application>',
      ),
      /EXDevMenuShowsAtLaunch" android:value="false"/,
    )
  })
})

describe('stampAndroidVersion', () => {
  it('writes VERIFY_APK_VERSION and replaces versionName so Gradle cannot stay UP-TO-DATE', () => {
    assert.equal(
      stampGradleProperties('org.gradle.jvmargs=-Xmx2g\n', '4bf1a18'),
      'org.gradle.jvmargs=-Xmx2g\nVERIFY_APK_VERSION=4bf1a18\n',
    )
    assert.match(
      stampBuildGradleVersionName('versionName "e0543f5"', '4bf1a18'),
      /versionName "4bf1a18"/,
    )
    const root = mkdtempSync(join(tmpdir(), 'verify-android-'))
    try {
      mkdirSync(join(root, 'app'), { recursive: true })
      writeFileSync(join(root, 'gradle.properties'), 'android.useAndroidX=true\n')
      writeFileSync(
        join(root, 'app', 'build.gradle'),
        'defaultConfig { versionName "e0543f5" }\n',
      )
      const result = stampAndroidVersion({ androidDir: root, version: '4bf1a18' })
      assert.deepEqual(result, { stamped: true, gradleStamped: true })
      assert.match(
        readFileSync(join(root, 'gradle.properties'), 'utf8'),
        /VERIFY_APK_VERSION=4bf1a18/,
      )
      assert.match(
        readFileSync(join(root, 'app', 'build.gradle'), 'utf8'),
        /versionName "4bf1a18"/,
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('adbReverseArgs', () => {
  it('maps a host port onto the emulator loopback', () => {
    assert.deepEqual(adbReverseArgs(DEVICE_SERIAL, 8081), [
      '-s',
      DEVICE_SERIAL,
      'reverse',
      'tcp:8081',
      'tcp:8081',
    ])
  })
})

describe('driveDeviceReversePorts', () => {
  it('re-applies Metro and web reverses before Maestro', () => {
    assert.deepEqual(driveDeviceReversePorts({ port: 8081, webPort: 3910 }), [
      8081,
      3910,
    ])
    const reversed = []
    ensureAdbReverses(DEVICE_SERIAL, [8081, 3910], (serial, port) => {
      reversed.push([serial, port])
    })
    assert.deepEqual(reversed, [
      [DEVICE_SERIAL, 8081],
      [DEVICE_SERIAL, 3910],
    ])
  })
})

describe('quoteForAdbShell', () => {
  it('single-quotes so device sh does not split on &', () => {
    assert.equal(quoteForAdbShell('a&b'), "'a&b'")
    assert.equal(quoteForAdbShell("it's"), `'it'\\''s'`)
  })
})

describe('adbOpenDevClientArgs', () => {
  it('opens the encoded deep link on the installed package', () => {
    const url = expoDevClientUrl({ scheme: 'exp+coffee-companion', metroPort: 8081 })
    const args = adbOpenDevClientArgs({
      serial: DEVICE_SERIAL,
      url,
      pkg: ANDROID_PACKAGE,
    })
    assert.deepEqual(args.slice(0, 6), [
      '-s',
      DEVICE_SERIAL,
      'shell',
      'am',
      'start',
      '-a',
    ])
    assert.ok(args.includes('android.intent.action.VIEW'))
    assert.ok(args.includes('-d'))
    assert.equal(args.at(-1), ANDROID_PACKAGE)
    assert.ok(!args.includes('coffeecompanion://expo-development-client/?url=http://127.0.0.1:8081'))
  })

  it('keeps the full URL with both flags and the package intact', () => {
    const url = expoDevClientUrl({ scheme: 'exp+coffee-companion', metroPort: 8081 })
    const args = adbOpenDevClientArgs({
      serial: DEVICE_SERIAL,
      url,
      pkg: ANDROID_PACKAGE,
    })
    const data = args[args.indexOf('-d') + 1]
    assert.equal(data, quoteForAdbShell(url))
    assert.match(data, new RegExp(DEV_CLIENT_DISABLE_AUTO_LAUNCH))
    assert.match(data, new RegExp(DEV_CLIENT_DISABLE_ONBOARDING))
    assert.ok(data.includes(`&${DEV_CLIENT_DISABLE_AUTO_LAUNCH}&${DEV_CLIENT_DISABLE_ONBOARDING}`))
    assert.ok(!args.includes(url))
    assert.equal(args.at(-1), ANDROID_PACKAGE)
    const joined = args.slice(args.indexOf('am')).join(' ')
    assert.ok(
      joined.endsWith(
        `&${DEV_CLIENT_DISABLE_AUTO_LAUNCH}&${DEV_CLIENT_DISABLE_ONBOARDING}' ${ANDROID_PACKAGE}`,
      ),
    )
  })
})

describe('adbShellHttpGetArgs', () => {
  it('quotes the device Metro URL so query strings cannot split wget', () => {
    const url = 'http://127.0.0.1:8081/status?x=1&y=2'
    const attempts = adbShellHttpGetArgs(DEVICE_SERIAL, url)
    assert.equal(attempts.length, 3)
    for (const args of attempts) {
      assert.equal(args.at(-1), quoteForAdbShell(url))
      assert.ok(args.at(-1).includes('&'))
      assert.ok(!args.includes(url))
    }
  })

  it('quotes Cookie headers so they stay one adb shell argv', () => {
    const url = deviceE2ESessionUrl(3910)
    const header = e2eAuthCookieHeader()
    const attempts = adbShellHttpGetArgs(DEVICE_SERIAL, url, [header])
    assert.equal(attempts.length, 3)
    for (const args of attempts) {
      assert.equal(args.at(-1), quoteForAdbShell(url))
      assert.ok(args.includes(quoteForAdbShell(header)))
      assert.ok(!args.includes(url))
      assert.ok(!args.includes(header))
    }
    assert.ok(attempts[0].includes('--header'))
    assert.ok(attempts[2].includes('-H'))
  })
})

describe('adbShellHttpCookieGetArgs', () => {
  it('quotes a whole curl/wget/nc command so Cookie stays inside adb shell', () => {
    const url = deviceE2ESessionUrl(3910)
    const header = e2eAuthCookieHeader()
    const commands = adbShellCookieGetCommands(url, header)
    const attempts = adbShellHttpCookieGetArgs(DEVICE_SERIAL, url, header)
    assert.match(commands[0], /^curl /)
    assert.equal(attempts.length, commands.length)
    for (let i = 0; i < commands.length; i++) {
      assert.equal(attempts[i].at(-1), quoteForAdbShell(commands[i]))
      assert.ok(attempts[i].at(-1).includes('Cookie'))
      assert.ok(!attempts[i].includes(url))
      assert.ok(!attempts[i].includes(header))
    }
  })
})

describe('amStartSucceeded', () => {
  it('treats a delivered-to-running-instance warning as success', () => {
    assert.equal(amStartSucceeded({ status: 0, stdout: '', stderr: '' }), true)
    assert.equal(
      amStartSucceeded({
        status: 1,
        stdout: `Starting: Intent { dat=exp+coffee-companion://expo-development-client/ }\n`,
        stderr: `Warning: ${AM_START_ALREADY_FOREGROUND}.\n`,
      }),
      true,
    )
    assert.equal(
      amStartSucceeded({
        status: 1,
        stdout: '',
        stderr: '/system/bin/sh: dev.offbyonelabs.coffeecompanion: inaccessible or not found\n',
      }),
      false,
    )
  })
})

describe('parseAdbReverseList', () => {
  it('reads device-to-host tcp mappings', () => {
    const reversed = parseAdbReverseList(`UsbFfs tcp:8081 tcp:8081
host-16 tcp:3910 tcp:3910
`)
    assert.deepEqual(reversed, [
      { device: 8081, host: 8081 },
      { device: 3910, host: 3910 },
    ])
  })
})

describe('missingAdbReverses', () => {
  it('names ports that are not reversed', () => {
    assert.deepEqual(
      missingAdbReverses(
        [{ device: 8081, host: 8081 }],
        [8081, 3910],
      ),
      [3910],
    )
  })
})

describe('parseUiDump', () => {
  it('detects the Expo dev-client launcher', () => {
    const ui = parseUiDump(
      '<node text="Development servers"/><node text="npx expo start"/><node text="Connect"/>',
    )
    assert.equal(ui.hasDevLauncher, true)
    assert.equal(ui.hasAppRoot, false)
  })

  it('detects the signed-out app root', () => {
    const ui = parseUiDump(
      `<node resource-id="dev.offbyonelabs.coffeecompanion:id/${SIGN_IN_TEST_ID}"/>`,
    )
    assert.equal(ui.hasSignIn, true)
    assert.equal(ui.hasAppRoot, true)
    assert.equal(ui.hasDevLauncher, false)
  })

  it('treats visible Sign in with Google copy as the signed-out app', () => {
    const ui = parseUiDump(
      '<node text="Sign in"/><node text="Sign in with Google"/><node text="E2E sign in"/>',
    )
    assert.equal(ui.hasSignInCopy, true)
    assert.equal(ui.hasAppRoot, true)
  })

  it('detects the first-run developer-menu sheet', () => {
    const ui = parseUiDump(
      '<node text="This is the developer menu. It gives you access to useful tools in your development builds."/>' +
        `<node text="${DEV_MENU_CONTINUE_TEXT}" bounds="[100,800][980,920]"/>`,
    )
    assert.equal(ui.hasDevMenuOnboarding, true)
  })

  it('detects the regular developer menu covering sign-in', () => {
    const ui = parseUiDump(
      '<node text="Runtime version: exposdk:57.0.0"/>' +
        '<node text="Go home"/>' +
        `<node content-desc="${DEV_MENU_CLOSE_TEXT}" bounds="[900,40][980,120]"/>`,
    )
    assert.equal(ui.hasDevMenu, true)
    assert.equal(ui.hasDevMenuOnboarding, false)
  })
})

describe('parseUiNodeCenter', () => {
  it('returns the tap target for the Continue button', () => {
    assert.deepEqual(
      parseUiNodeCenter(
        `<node text="${DEV_MENU_CONTINUE_TEXT}" bounds="[100,800][980,920]"/>`,
        DEV_MENU_CONTINUE_TEXT,
      ),
      { x: 540, y: 860 },
    )
  })

  it('returns the tap target for the Close icon content-desc', () => {
    assert.deepEqual(
      parseUiNodeCenter(
        `<node content-desc="${DEV_MENU_CLOSE_TEXT}" bounds="[900,40][980,120]"/>`,
        DEV_MENU_CLOSE_TEXT,
      ),
      { x: 940, y: 80 },
    )
  })
})

describe('appForegroundTick', () => {
  it('waits on the launcher and succeeds on sign-in-screen', () => {
    assert.equal(
      appForegroundTick({
        dump: '<node text="Development servers"/>',
      }).status,
      'wait',
    )
    assert.equal(
      appForegroundTick({
        dump: `<node content-desc="${SIGN_IN_TEST_ID}"/>`,
      }).status,
      'ok',
    )
  })

  it('asks to dismiss the developer-menu sheet even when sign-in copy is visible', () => {
    const tick = appForegroundTick({
      dump:
        '<node text="This is the developer menu. It gives you access to useful tools."/>' +
        '<node text="Sign in with Google"/>' +
        `<node text="${DEV_MENU_CONTINUE_TEXT}" bounds="[100,800][980,920]"/>`,
    })
    assert.equal(tick.status, 'dismiss')
    assert.match(tick.reason, /developer-menu/)
    assert.equal(tick.ui.hasAppRoot, true)
  })

  it('asks to dismiss the regular developer menu covering sign-in', () => {
    const tick = appForegroundTick({
      dump:
        '<node text="Runtime version: exposdk:57.0.0"/>' +
        '<node text="Go home"/>' +
        '<node text="Sign in with Google"/>' +
        `<node content-desc="${DEV_MENU_CLOSE_TEXT}" bounds="[900,40][980,120]"/>`,
    })
    assert.equal(tick.status, 'dismiss')
    assert.match(tick.reason, /developer menu/)
  })
})

describe('appForegroundReason', () => {
  it('names the onboarding sheet', () => {
    assert.match(
      appForegroundReason({ hasDevMenuOnboarding: true, hasAppRoot: true }),
      /developer-menu/,
    )
  })
})

describe('portBusyMessage', () => {
  it('does not call port 3910 Metro', () => {
    const message = portBusyMessage(3910, [99], 'web')
    assert.match(message, /3910/)
    assert.match(message, /VERIFY_PORT/)
    assert.match(message, /not Metro/)
    assert.doesNotMatch(message, /VERIFY_METRO_PORT/)
  })

  it('names Metro only for the Metro port', () => {
    const message = portBusyMessage(8081, [42], 'metro')
    assert.match(message, /Metro/)
    assert.match(message, /VERIFY_METRO_PORT/)
  })
})

describe('adbTapArgs', () => {
  it('taps the Continue center through adb input', () => {
    assert.deepEqual(adbTapArgs(DEVICE_SERIAL, 540, 860), [
      '-s',
      DEVICE_SERIAL,
      'shell',
      'input',
      'tap',
      '540',
      '860',
    ])
  })
})

describe('adbKeyEventArgs', () => {
  it('sends KEYCODE_BACK to dismiss the developer menu', () => {
    assert.deepEqual(adbKeyEventArgs(DEVICE_SERIAL, 'KEYCODE_BACK'), [
      '-s',
      DEVICE_SERIAL,
      'shell',
      'input',
      'keyevent',
      'KEYCODE_BACK',
    ])
  })
})

describe('deviceFailureArtifacts', () => {
  it('writes screenshot and uiautomator dump names under the dest', () => {
    const paths = deviceFailureArtifactPaths('/tmp/run/sign-in-and-out')
    assert.equal(paths.screenshotPath.endsWith(DEVICE_FAILURE_SCREENSHOT), true)
    assert.equal(paths.dumpPath.endsWith(DEVICE_FAILURE_DUMP), true)
    assert.equal(paths.webLogPath.endsWith(DEVICE_FAILURE_WEB_LOG), true)
    assert.equal(paths.logcatPath.endsWith(DEVICE_FAILURE_LOGCAT), true)
    assert.deepEqual(adbScreencapArgs(DEVICE_SERIAL), [
      '-s',
      DEVICE_SERIAL,
      'exec-out',
      'screencap',
      '-p',
    ])
    assert.deepEqual(adbLogcatDumpArgs(DEVICE_SERIAL), [
      '-s',
      DEVICE_SERIAL,
      'logcat',
      '-d',
      '-t',
      '400',
      'ReactNativeJS:V',
      '*:S',
    ])
    assert.deepEqual(adbPidofArgs(DEVICE_SERIAL, ANDROID_PACKAGE), [
      '-s',
      DEVICE_SERIAL,
      'shell',
      'pidof',
      '-s',
      ANDROID_PACKAGE,
    ])
    assert.equal(parseAdbPid('  4321\n'), '4321')
    assert.equal(parseAdbPid(''), null)
    assert.deepEqual(adbLogcatDumpArgs(DEVICE_SERIAL, { pid: '4321' }), [
      '-s',
      DEVICE_SERIAL,
      'logcat',
      '-d',
      '-t',
      '400',
      '--pid',
      '4321',
      'ReactNativeJS:V',
      '*:S',
    ])
  })
})

describe('launchDeviceTeardownPlan', () => {
  it('never uninstalls the APK when launch-device fails', () => {
    const plan = launchDeviceTeardownPlan({
      serial: DEVICE_SERIAL,
      androidPackage: ANDROID_PACKAGE,
      expoPid: 9,
    })
    assert.equal(plan.uninstallPackage, false)
    assert.equal(plan.clearReverses, true)
    assert.equal(plan.stopExpo, true)
  })
})

describe('verifyListenPorts', () => {
  it('includes Metro and the dedicated web port', () => {
    const ports = verifyListenPorts({
      VERIFY_METRO_PORT: '8081',
      VERIFY_PORT: '3910',
    })
    assert.deepEqual(
      ports.map((entry) => entry.port).sort((a, b) => a - b),
      [3910, 8081],
    )
    assert.equal(ports.find((entry) => entry.port === 3910).kind, 'web')
    assert.equal(ports.find((entry) => entry.port === 8081).kind, 'metro')
  })
})

describe('ownedVerifyListenPorts', () => {
  it('returns no ports when state is missing', () => {
    assert.deepEqual(
      ownedVerifyListenPorts(null, {
        VERIFY_METRO_PORT: '8081',
        VERIFY_PORT: '3910',
      }),
      [],
    )
  })

  it('returns only ports this helper recorded', () => {
    assert.deepEqual(
      ownedVerifyListenPorts(
        { metroPid: 11, port: 8082 },
        { VERIFY_METRO_PORT: '8081', VERIFY_PORT: '3910' },
      ),
      [{ port: 8082, kind: 'metro' }],
    )
    assert.deepEqual(
      ownedVerifyListenPorts(
        { metroPid: 11, port: 8082, webPid: 22, webPort: 3911 },
        { VERIFY_METRO_PORT: '8081', VERIFY_PORT: '3910' },
      ),
      [
        { port: 8082, kind: 'metro' },
        { port: 3911, kind: 'web' },
      ],
    )
    assert.deepEqual(
      ownedVerifyListenPorts(
        { emulatorPid: 33, serial: 'emulator-5554' },
        { VERIFY_METRO_PORT: '8081', VERIFY_PORT: '3910' },
      ),
      [],
    )
  })
})

describe('metroPortClaim', () => {
  it('does not stop a pre-existing foreign listener on the port', () => {
    // First arg is the snapshot taken before expo run:android.
    assert.deepEqual(metroPortClaim([11], [11]), { stop: [], foreign: [11] })
    assert.deepEqual(metroPortClaim([11], [11, 22]), {
      stop: [22],
      foreign: [11],
    })
  })

  it('stops only pids that appeared after the snapshot', () => {
    assert.deepEqual(metroPortClaim([], [22]), { stop: [22], foreign: [] })
    assert.deepEqual(metroPortClaim([11], []), { stop: [], foreign: [] })
  })
})

describe('verify-mobile usage defaults', () => {
  const skill = () =>
    readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../SKILL.md'),
      'utf8',
    )
  const controlSrc = () =>
    readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'control.mjs'),
      'utf8',
    )

  it('shows default verify-device and launch-device commands before VERIFY_AVD overrides', () => {
    const fences = skill().split('```bash').slice(1)
    for (const fence of fences) {
      const body = fence.split('```')[0]
      const commands = body
        .split('\n')
        .filter((line) =>
          /helpers\/control (verify-device|launch-device)/.test(line),
        )
      if (commands.length === 0) continue
      assert.ok(
        commands.some((line) => !line.startsWith('VERIFY_AVD=')),
        'example must show the default command before VERIFY_AVD',
      )
    }
  })

  it('names default AVD and ports in control usage text', () => {
    const start = controlSrc().indexOf('function usage()')
    assert.ok(start >= 0)
    const usage = controlSrc().slice(start, controlSrc().indexOf('\nexport {', start))
    assert.match(usage, /VERIFY_METRO_PORT \(default 8081\)/)
    assert.match(usage, /verify-pixel/)
    assert.match(usage, /VERIFY_PORT \(default 3910\)/)
    assert.doesNotMatch(usage, /VERIFY_AVD=Pixel_7/)
  })
})

describe('spawnExpoAndroid', () => {
  it('snapshots Metro-port pids before expo run:android', () => {
    const calls = []
    const { metroPidsBeforeExpo, expo } = spawnExpoAndroid({
      metroPort: 8081,
      avdName: AVD_NAME,
      noBuildCache: false,
      logPath: '/tmp/expo-android.log',
      cwd: '/repo',
      env: { CI: '1' },
      listPids: (port) => {
        calls.push(`list:${port}`)
        return [11]
      },
      androidArgs: (avdName, { noBuildCache } = {}) => {
        calls.push(`args:${avdName}:${noBuildCache}`)
        return ['expo', 'run:android']
      },
      spawn: (command, args, logPath, opts) => {
        calls.push(`spawn:${command}:${args.join(',')}:${logPath}:${opts.cwd}`)
        return { pid: 99 }
      },
    })
    assert.deepEqual(calls, [
      'list:8081',
      `args:${AVD_NAME}:false`,
      'spawn:pnpm:expo,run:android:/tmp/expo-android.log:/repo',
    ])
    assert.deepEqual(metroPidsBeforeExpo, [11])
    assert.equal(expo.pid, 99)
  })
})

describe('ownedDevicePackage', () => {
  it('owns the package when this run booted the emulator', () => {
    assert.equal(
      ownedDevicePackage({ attachedEmulator: false, installedBefore: true }),
      true,
    )
    assert.equal(
      ownedDevicePackage({ attachedEmulator: false, installedBefore: false }),
      true,
    )
  })

  it('owns the package on an attached emulator only when it was missing', () => {
    assert.equal(
      ownedDevicePackage({ attachedEmulator: true, installedBefore: true }),
      false,
    )
    assert.equal(
      ownedDevicePackage({ attachedEmulator: true, installedBefore: false }),
      true,
    )
  })
})

describe('shouldUninstallStalePackage', () => {
  it('uninstalls a stale APK only when this run owns it', () => {
    assert.equal(
      shouldUninstallStalePackage({
        ownedPackage: true,
        rebuild: true,
        installedVersion: 'e0543f5',
      }),
      true,
    )
    assert.equal(
      shouldUninstallStalePackage({
        ownedPackage: false,
        rebuild: true,
        installedVersion: 'e0543f5',
      }),
      false,
    )
    assert.equal(
      shouldUninstallStalePackage({
        ownedPackage: true,
        rebuild: true,
        installedVersion: null,
      }),
      false,
    )
  })
})

describe('shouldUninstallRecordedPackage', () => {
  it('uninstalls a recorded package unless an attached run found it already installed', () => {
    assert.equal(
      shouldUninstallRecordedPackage({
        serial: DEVICE_SERIAL,
        androidPackage: ANDROID_PACKAGE,
      }),
      true,
    )
    assert.equal(
      shouldUninstallRecordedPackage({
        serial: DEVICE_SERIAL,
        androidPackage: ANDROID_PACKAGE,
        ownedPackage: true,
      }),
      true,
    )
    assert.equal(
      shouldUninstallRecordedPackage({
        serial: DEVICE_SERIAL,
        androidPackage: ANDROID_PACKAGE,
        ownedPackage: false,
      }),
      false,
    )
    assert.equal(shouldUninstallRecordedPackage(null), false)
  })
})

describe('shouldRebuildApk', () => {
  it('rebuilds when the installed versionName is missing or stale', () => {
    assert.equal(
      shouldRebuildApk({ installedVersion: null, expectedVersion: '4bf1a18' }),
      true,
    )
    assert.equal(
      shouldRebuildApk({
        installedVersion: 'e0543f5',
        expectedVersion: '4bf1a18',
      }),
      true,
    )
    assert.equal(
      shouldRebuildApk({
        installedVersion: '4bf1a18',
        expectedVersion: '4bf1a18',
      }),
      false,
    )
  })
})

describe('shouldClearAndroidBuildCache', () => {
  it('clears the cache only when an installed version is present and stale', () => {
    assert.equal(
      shouldClearAndroidBuildCache({
        installedVersion: null,
        rebuild: true,
      }),
      false,
    )
    assert.equal(
      shouldClearAndroidBuildCache({
        installedVersion: 'e0543f5',
        rebuild: true,
      }),
      true,
    )
    assert.equal(
      shouldClearAndroidBuildCache({
        installedVersion: '4bf1a18',
        rebuild: false,
      }),
      false,
    )
  })
})

describe('resolveEmulatorAttachment', () => {
  it('attaches when emulator-5554 is already a device', () => {
    const resolved = resolveEmulatorAttachment({
      serial: DEVICE_SERIAL,
      devices: [{ serial: DEVICE_SERIAL, state: 'device' }],
      chosenAvd: 'verify-pixel',
      runningAvd: 'Pixel_7',
      explicitAvd: false,
    })
    assert.deepEqual(resolved, { action: 'attach', avdName: 'Pixel_7' })
  })

  it('boots when the serial is missing', () => {
    const resolved = resolveEmulatorAttachment({
      serial: DEVICE_SERIAL,
      devices: [],
      chosenAvd: 'Pixel_7',
    })
    assert.deepEqual(resolved, { action: 'boot', avdName: 'Pixel_7' })
  })

  it('fails when VERIFY_AVD does not match the running AVD', () => {
    assert.throws(
      () =>
        resolveEmulatorAttachment({
          serial: DEVICE_SERIAL,
          devices: [{ serial: DEVICE_SERIAL, state: 'device' }],
          chosenAvd: 'Pixel_6',
          runningAvd: 'Pixel_7',
          explicitAvd: true,
        }),
      /Pixel_7/,
    )
  })

  it('waits on an offline serial instead of failing', () => {
    assert.deepEqual(
      resolveEmulatorAttachment({
        serial: DEVICE_SERIAL,
        devices: [{ serial: DEVICE_SERIAL, state: 'offline' }],
        chosenAvd: 'Pixel_7',
      }),
      { action: 'wait', state: 'offline', avdName: 'Pixel_7' },
    )
  })
})

describe('serialWaitTick', () => {
  it('waits while offline, attaches when device, and boots when gone', () => {
    assert.deepEqual(
      serialWaitTick({
        serial: DEVICE_SERIAL,
        devices: [{ serial: DEVICE_SERIAL, state: 'offline' }],
      }),
      { status: 'wait', state: 'offline' },
    )
    assert.deepEqual(
      serialWaitTick({
        serial: DEVICE_SERIAL,
        devices: [{ serial: DEVICE_SERIAL, state: 'unauthorized' }],
      }),
      { status: 'wait', state: 'unauthorized' },
    )
    assert.deepEqual(
      serialWaitTick({
        serial: DEVICE_SERIAL,
        devices: [{ serial: DEVICE_SERIAL, state: 'device' }],
      }),
      { status: 'device' },
    )
    assert.deepEqual(
      serialWaitTick({ serial: DEVICE_SERIAL, devices: [] }),
      { status: 'gone' },
    )
  })
})

describe('waitForSerialReady', () => {
  it('treats offline-then-gone as boot', async () => {
    const snapshots = [
      [{ serial: DEVICE_SERIAL, state: 'offline' }],
      [],
    ]
    let i = 0
    let t = 0
    const result = await waitForSerialReady(DEVICE_SERIAL, 5_000, {
      listDevices: () => snapshots[Math.min(i++, snapshots.length - 1)],
      sleep: async () => {},
      now: () => ++t,
      staleAfterMs: 10_000,
      kill: () => {
        throw new Error('should not kill a serial that is about to leave')
      },
    })
    assert.equal(result.action, 'boot')
  })

  it('treats offline-then-device as attach', async () => {
    const snapshots = [
      [{ serial: DEVICE_SERIAL, state: 'offline' }],
      [{ serial: DEVICE_SERIAL, state: 'device' }],
    ]
    let i = 0
    let t = 0
    const result = await waitForSerialReady(DEVICE_SERIAL, 5_000, {
      listDevices: () => snapshots[Math.min(i++, snapshots.length - 1)],
      sleep: async () => {},
      now: () => ++t,
      staleAfterMs: 10_000,
      kill: () => {
        throw new Error('should not kill a serial that is becoming device')
      },
    })
    assert.equal(result.action, 'attach')
    assert.equal(result.state, 'device')
  })
})

describe('waitForSerialGone', () => {
  it('succeeds once the serial leaves adb devices', async () => {
    const snapshots = [
      [{ serial: DEVICE_SERIAL, state: 'offline' }],
      [],
    ]
    let i = 0
    let t = 0
    const result = await waitForSerialGone(DEVICE_SERIAL, 5_000, {
      listDevices: () => snapshots[Math.min(i++, snapshots.length - 1)],
      sleep: async () => {},
      now: () => ++t,
    })
    assert.equal(result.status, 'ok')
  })
})

describe('adbEmuKillArgs', () => {
  it('asks adb to kill the emulator before a process signal', () => {
    assert.deepEqual(adbEmuKillArgs(DEVICE_SERIAL), [
      '-s',
      DEVICE_SERIAL,
      'emu',
      'kill',
    ])
  })
})

describe('portFreeTick', () => {
  it('waits while listeners remain', () => {
    assert.deepEqual(portFreeTick([11]), { status: 'wait', pids: [11] })
    assert.deepEqual(portFreeTick([]), { status: 'ok' })
  })
})

describe('waitForPortFree', () => {
  it('succeeds after listeners leave', async () => {
    const pidSets = [[42], []]
    let i = 0
    let t = 0
    const result = await waitForPortFree(3910, 5_000, {
      listPids: () => pidSets[Math.min(i++, pidSets.length - 1)],
      sleep: async () => {},
      now: () => ++t,
    })
    assert.equal(result.status, 'ok')
  })
})

describe('verifyDevicePlan', () => {
  it('runs cleanup, launch-device, doctor, and drive-device and leaves the instance up', () => {
    const plan = verifyDevicePlan()
    assert.equal(plan.flow, DEFAULT_VERIFY_DEVICE_FLOW)
    assert.deepEqual(plan.steps, [
      'cleanup',
      'launch-device',
      'doctor',
      'drive-device',
    ])
    assert.equal(plan.leaveUpOnFailure, true)
    assert.equal(verifyDevicePlan('sign-in-and-out').flow, 'sign-in-and-out')
    assert.equal(
      verifyDeviceHeadline(plan),
      'verify-device: cleanup → launch-device → doctor → drive-device (sign-in-and-out); the instance stays up if a later step fails',
    )
  })
})

describe('pidGoneTick', () => {
  it('is ok when the pid is missing or not alive', () => {
    assert.deepEqual(pidGoneTick({ pid: 11, alive: false }), { status: 'ok' })
    assert.deepEqual(pidGoneTick({ pid: null, alive: true }), { status: 'ok' })
    assert.deepEqual(pidGoneTick({ pid: 11, alive: true }), { status: 'wait' })
  })
})

describe('stopSignalTick', () => {
  it('escalates SIGTERM to SIGKILL after the grace period', () => {
    assert.equal(stopSignalTick({ alive: false, elapsedMs: 0, escalated: false }).status, 'ok')
    assert.equal(
      stopSignalTick({
        alive: true,
        elapsedMs: 7_999,
        escalated: false,
        escalateAfterMs: 8_000,
      }).status,
      'wait',
    )
    assert.equal(
      stopSignalTick({
        alive: true,
        elapsedMs: 8_000,
        escalated: false,
        escalateAfterMs: 8_000,
      }).status,
      'escalate',
    )
    assert.equal(
      stopSignalTick({
        alive: true,
        elapsedMs: 9_000,
        escalated: true,
        escalateAfterMs: 8_000,
      }).status,
      'wait',
    )
  })
})

describe('parseLockPid', () => {
  it('reads a leading integer from an emulator lock file', () => {
    assert.equal(parseLockPid('87011\n'), 87011)
    assert.equal(parseLockPid('  42'), 42)
    assert.equal(parseLockPid(''), null)
    assert.equal(parseLockPid('qemu'), null)
  })
})

describe('avdLockTick', () => {
  it('waits while any lock file still exists', () => {
    assert.deepEqual(avdLockTick({ locks: [] }), { status: 'ok' })
    assert.deepEqual(
      avdLockTick({
        locks: [
          { name: 'hardware-qemu.ini.lock', exists: false },
          { name: 'multiinstance.lock', exists: false },
        ],
      }),
      { status: 'ok' },
    )
    assert.deepEqual(
      avdLockTick({
        locks: [
          { name: 'hardware-qemu.ini.lock', exists: true },
          { name: 'multiinstance.lock', exists: false },
        ],
      }),
      { status: 'wait', locks: ['hardware-qemu.ini.lock'] },
    )
  })
})

describe('parseEmulatorAvdPids', () => {
  it('finds emulator and qemu lines for that AVD only', () => {
    const text = [
      '87011 /sdk/emulator/emulator -avd verify-pixel -port 5554',
      '87020 qemu-system-aarch64 -avd verify-pixel -verbose',
      '99 /sdk/emulator/emulator -avd Pixel_7 -port 5556',
      '100 /usr/bin/vim notes',
    ].join('\n')
    assert.deepEqual(parseEmulatorAvdPids(text, 'verify-pixel'), [87011, 87020])
    assert.deepEqual(parseEmulatorAvdPids(text, 'Pixel_7'), [99])
  })
})

describe('avdBusyMessage', () => {
  it('names the pid and refuses -read-only', () => {
    const message = avdBusyMessage('verify-pixel', [87011])
    assert.match(message, /verify-pixel/)
    assert.match(message, /87011/)
    assert.match(message, /Do not pass -read-only/)
  })
})

describe('avdLockPaths', () => {
  it('points at the AVD lock files under ANDROID_AVD_HOME', () => {
    const paths = avdLockPaths('verify-pixel', { ANDROID_AVD_HOME: '/tmp/avd-home' })
    assert.deepEqual(paths, [
      '/tmp/avd-home/verify-pixel.avd/hardware-qemu.ini.lock',
      '/tmp/avd-home/verify-pixel.avd/multiinstance.lock',
    ])
  })
})

describe('waitForPidGone', () => {
  it('succeeds once the pid is no longer alive', async () => {
    const aliveAt = [true, true, false]
    let i = 0
    let t = 0
    const result = await waitForPidGone(87011, 5_000, {
      alive: () => aliveAt[Math.min(i++, aliveAt.length - 1)],
      sleep: async () => {},
      now: () => ++t,
    })
    assert.equal(result.status, 'ok')
  })
})

describe('stopPidAndWait', () => {
  it('escalates SIGTERM to SIGKILL when the group stays alive', async () => {
    const signals = []
    let alive = true
    let t = 0
    const stopped = []
    const result = await stopPidAndWait(87011, 'emulator', stopped, {
      escalateAfterMs: 3,
      timeoutMs: 10,
      now: () => ++t,
      sleep: async () => {},
      alive: () => alive,
      signal: (_pid, sig) => {
        signals.push(sig)
        if (sig === 'SIGKILL') alive = false
        return { group: true }
      },
    })
    assert.equal(result.status, 'ok')
    assert.equal(result.escalated, true)
    assert.deepEqual(signals, ['SIGTERM', 'SIGKILL'])
    assert.deepEqual(stopped, [{ kind: 'emulator', pid: 87011, group: true }])
  })

  it('does not escalate when SIGTERM is enough', async () => {
    const signals = []
    let alive = true
    let t = 0
    const result = await stopPidAndWait(11, 'emulator', [], {
      escalateAfterMs: 5,
      timeoutMs: 10,
      now: () => ++t,
      sleep: async () => {},
      alive: () => alive,
      signal: (_pid, sig) => {
        signals.push(sig)
        if (sig === 'SIGTERM') alive = false
        return { group: true }
      },
    })
    assert.equal(result.status, 'ok')
    assert.equal(result.escalated, false)
    assert.deepEqual(signals, ['SIGTERM'])
  })

  it('times out when the pid ignores both signals', async () => {
    let t = 0
    const result = await stopPidAndWait(11, 'emulator', [], {
      escalateAfterMs: 2,
      timeoutMs: 5,
      now: () => ++t,
      sleep: async () => {},
      alive: () => true,
      signal: () => ({ group: true }),
    })
    assert.equal(result.status, 'timeout')
    assert.equal(result.escalated, true)
  })
})

describe('waitForAvdLocksReleased', () => {
  it('succeeds once the lock files are gone', async () => {
    const snapshots = [
      [{ name: 'multiinstance.lock', exists: true }],
      [{ name: 'multiinstance.lock', exists: false }],
    ]
    let i = 0
    let t = 0
    const result = await waitForAvdLocksReleased('verify-pixel', 5_000, {
      inspectLocks: () => snapshots[Math.min(i++, snapshots.length - 1)],
      sleep: async () => {},
      now: () => ++t,
    })
    assert.equal(result.status, 'ok')
  })
})

describe('ensureAvdFreeToBoot', () => {
  it('stops our recorded pid and waits for leftover pids and locks', async () => {
    const signals = []
    let ourAlive = true
    let leftoverAlive = true
    let lockExists = true
    let t = 0
    const result = await ensureAvdFreeToBoot('verify-pixel', {
      ourPid: 11,
      listPids: () => [11, leftoverAlive ? 22 : null].filter(Boolean),
      alive: (pid) => (pid === 11 ? ourAlive : leftoverAlive),
      signal: (pid, sig) => {
        signals.push([pid, sig])
        if (pid === 11 && sig === 'SIGTERM') ourAlive = false
        return { group: true }
      },
      inspectLocks: () => [{ name: 'multiinstance.lock', exists: lockExists }],
      sleep: async () => {
        leftoverAlive = false
        lockExists = false
      },
      now: () => ++t,
      pidTimeoutMs: 10,
      lockTimeoutMs: 10,
    })
    assert.equal(result.status, 'ok')
    assert.deepEqual(signals, [[11, 'SIGTERM']])
  })

  it('fails with the foreign pid when a leftover emulator stays up', async () => {
    let t = 0
    await assert.rejects(
      () =>
        ensureAvdFreeToBoot('verify-pixel', {
          ourPid: null,
          listPids: () => [87011],
          alive: () => true,
          inspectLocks: () => [{ name: 'multiinstance.lock', exists: true }],
          sleep: async () => {},
          now: () => ++t,
          pidTimeoutMs: 3,
          lockTimeoutMs: 3,
        }),
      /87011/,
    )
  })
})

describe('deviceReadyProblems', () => {
  it('flags a foreground launcher and a missing Metro reverse', () => {
    const problems = deviceReadyProblems({
      reverseList: 'UsbFfs tcp:3910 tcp:3910\n',
      requiredPorts: [8081, 3910],
      checkedDeviceMetro: true,
      deviceStatusBody: '',
      ui: parseUiDump('<node text="Development servers"/>'),
    })
    assert.ok(problems.some((problem) => problem.includes('tcp:8081')))
    assert.ok(problems.some((problem) => /Metro is not reachable/.test(problem)))
    assert.ok(problems.some((problem) => /dev-client launcher/.test(problem)))
  })

  it('is empty when reverses, Metro, and the app root are present', () => {
    const problems = deviceReadyProblems({
      reverseList: 'UsbFfs tcp:8081 tcp:8081\nhost-16 tcp:3910 tcp:3910\n',
      requiredPorts: [8081, 3910],
      checkedDeviceMetro: true,
      deviceStatusBody: 'packager-status:running',
      ui: parseUiDump(`<node content-desc="${SIGN_IN_TEST_ID}"/>`),
    })
    assert.deepEqual(problems, [])
  })

  it('does not block when the device has no HTTP client', () => {
    const problems = deviceReadyProblems({
      reverseList: 'UsbFfs tcp:8081 tcp:8081\nhost-16 tcp:3910 tcp:3910\n',
      requiredPorts: [8081, 3910],
      ui: parseUiDump(`<node content-desc="${SIGN_IN_TEST_ID}"/>`),
    })
    assert.equal(
      problems.some((problem) => /get-session|http client/i.test(problem)),
      false,
    )
  })

  it('still fails when adb reverse does not map Metro or the web port', () => {
    const problems = deviceReadyProblems({
      reverseList: '',
      requiredPorts: [8081, 3910],
      ui: parseUiDump(`<node content-desc="${SIGN_IN_TEST_ID}"/>`),
    })
    assert.ok(problems.some((problem) => problem.includes('tcp:8081')))
    assert.ok(problems.some((problem) => problem.includes('tcp:3910')))
  })

  it('flags the regular developer menu as covering the app', () => {
    const problems = deviceReadyProblems({
      reverseList: 'UsbFfs tcp:8081 tcp:8081\nhost-16 tcp:3910 tcp:3910\n',
      requiredPorts: [8081, 3910],
      checkedDeviceMetro: true,
      deviceStatusBody: 'packager-status:running',
      ui: parseUiDump(
        '<node text="Runtime version: exposdk:57.0.0"/>' +
          '<node text="Go home"/>',
      ),
    })
    assert.ok(problems.some((problem) => /developer menu is covering/.test(problem)))
  })

  it('flags the first-run developer-menu sheet as covering the app', () => {
    const problems = deviceReadyProblems({
      reverseList: 'UsbFfs tcp:8081 tcp:8081\nhost-16 tcp:3910 tcp:3910\n',
      requiredPorts: [8081, 3910],
      checkedDeviceMetro: true,
      deviceStatusBody: 'packager-status:running',
      ui: parseUiDump(
        '<node text="This is the developer menu. It gives you access to useful tools."/>' +
          '<node text="Sign in with Google"/>',
      ),
    })
    assert.ok(problems.some((problem) => /developer-menu onboarding/.test(problem)))
    assert.ok(!problems.some((problem) => /dev-client launcher/.test(problem)))
  })
})

describe('maestroDeviceArgs', () => {
  it('passes the expo-development-client URL into the flow', () => {
    const url = expoDevClientUrl({ scheme: 'exp+coffee-companion', metroPort: 8081 })
    const args = maestroDeviceArgs({
      serial: DEVICE_SERIAL,
      dest: '/tmp/out',
      flowPath: '/tmp/flow.yaml',
      expoDevClientUrl: url,
    })
    const envAt = args.indexOf('-e')
    assert.ok(envAt >= 0)
    assert.equal(args[envAt + 1], `EXPO_DEV_CLIENT_URL=${url}`)
    assert.ok(args.includes('--device'))
    assert.ok(args.includes(DEVICE_SERIAL))
  })
})

describe('sign-in-and-out flow', () => {
  const flow = () =>
    readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../flows/sign-in-and-out.yaml'),
      'utf8',
    )

  it('opens the injected deep link after launchApp so clearState cannot leave the launcher', () => {
    const yaml = flow()
    assert.match(yaml, /launchApp/)
    assert.match(yaml, /clearState: true/)
    assert.match(yaml, /openLink/)
    assert.match(yaml, /EXPO_DEV_CLIENT_URL/)
    assert.match(yaml, /sign-in-screen/)
    const launchAt = yaml.indexOf('launchApp')
    const openAt = yaml.indexOf('openLink')
    assert.ok(openAt > launchAt)
  })

  it('waits for the Expo launcher then re-opens the deep link if it is still showing', () => {
    const yaml = flow()
    assert.match(yaml, /Fetch development servers/)
    assert.match(
      yaml,
      /Re-open Metro deep link if still on the Expo launcher/,
    )
    assert.match(yaml, /notVisible: "Fetch development servers"/)
    assert.equal([...yaml.matchAll(/openLink:/g)].length, 2)
  })

  it('dismisses overlay sheets only when they are visible, then waits for sign-in-screen', () => {
    const yaml = flow()
    assert.match(yaml, /when:\n\s+visible: "This is the developer menu/)
    assert.match(yaml, /text: "Continue"/)
    assert.match(yaml, /when:\n\s+visible: "Runtime version/)
    assert.match(yaml, /text: "Close"/)
    assert.match(yaml, /extendedWaitUntil/)
    assert.doesNotMatch(yaml, /timeout: 15000/)
    const repeatAt = yaml.indexOf('repeat:')
    const continueAt = yaml.indexOf('This is the developer menu')
    assert.ok(repeatAt >= 0 && continueAt > repeatAt)
    assert.match(
      yaml,
      /while:\n\s+notVisible:\n\s+id: sign-in-screen/,
    )
  })

  it('asserts the approved sign-in and welcome headings', () => {
    const yaml = flow()
    assert.match(
      yaml,
      /id: sign-in-heading\n- copyTextFrom:\n\s+id: sign-in-heading\n- assertTrue: \$\{maestro\.copiedText == "Sign in"\}/,
    )
    assert.match(
      yaml,
      /id: welcome-heading\n- copyTextFrom:\n\s+id: welcome-heading\n- assertTrue: \$\{maestro\.copiedText == "Coffee Companion"\}/,
    )
    const signedOut = yaml.indexOf('takeScreenshot: signed-out\n')
    const signedOutAgain = yaml.indexOf('takeScreenshot: signed-out-again')
    const signOutTap = yaml.indexOf('id: sign-out')
    assert.match(
      yaml.slice(0, signedOut),
      /maestro\.copiedText == "Sign in"/,
    )
    assert.match(
      yaml.slice(signOutTap, signedOutAgain),
      /maestro\.copiedText == "Sign in"/,
      'signed-out-again must assert Sign in copy',
    )
    assert.equal(
      [...yaml.matchAll(/maestro\.copiedText == "Sign in"/g)].length,
      2,
    )
  })

  it('waits for welcome-screen after the e2e handle instead of asserting immediately', () => {
    const yaml = flow()
    assert.match(
      yaml,
      /id: e2e-sign-in\n# get-session is a network hop[^\n]*\n- extendedWaitUntil:\n\s+visible:\n\s+id: welcome-screen\n\s+timeout: 60000/,
    )
  })

  it('presses Back only when Go home is visible', () => {
    const yaml = flow()
    assert.match(
      yaml,
      /visible: "Go home"\n\s+commands:\n\s+- pressKey: back/,
    )
    const backAt = yaml.indexOf('pressKey: back')
    const goHomeAt = yaml.lastIndexOf('visible: "Go home"', backAt)
    assert.ok(goHomeAt >= 0)
    assert.ok(backAt > goHomeAt)
  })

  it('does not put timeout on tapOn', () => {
    const yaml = flow()
    for (const block of yaml.split('- tapOn:').slice(1)) {
      const body = block.split(/\n- /)[0]
      assert.doesNotMatch(body, /\btimeout:/)
    }
  })
})

describe('inspectMaestroFlows', () => {
  it('builds maestro check-syntax args', () => {
    assert.deepEqual(maestroCheckSyntaxArgs('/tmp/flow.yaml'), [
      'check-syntax',
      '/tmp/flow.yaml',
    ])
    assert.equal(
      resolveMaestroBin({
        env: { HOME: '/home/you' },
        exists: (path) => path === '/home/you/.maestro/bin/maestro',
      }),
      '/home/you/.maestro/bin/maestro',
    )
  })

  it('runs maestro check-syntax on every flow', { skip: !hasMaestro }, () => {
    const flowsDir = join(dirname(fileURLToPath(import.meta.url)), '../flows')
    const report = inspectMaestroFlows({ flowsDir })
    assert.equal(report.ok, true, report.problems.join('\n'))
    assert.deepEqual(
      report.flows.map((path) => path.slice(path.lastIndexOf('/') + 1)),
      listMaestroFlowPaths(flowsDir).map((path) => path.slice(path.lastIndexOf('/') + 1)),
    )
    assert.ok(report.flows.some((path) => path.endsWith('sign-in-and-out.yaml')))
  })

  it('requires syntax checks only for Maestro or device runs', () => {
    assert.equal(maestroSyntaxRequired({ harness: HARNESS_RNTL }), false)
    assert.equal(maestroSyntaxRequired({}), false)
    assert.equal(maestroSyntaxRequired({ harness: HARNESS_MAESTRO }), true)
    assert.equal(maestroSyntaxRequired({ serial: 'emulator-5554' }), true)
    assert.equal(
      maestroSyntaxRequired({ harness: HARNESS_RNTL, serial: 'emulator-5554' }),
      true,
    )
  })

  it('skips a missing CLI when the syntax check is optional', () => {
    const report = inspectMaestroFlows({
      bin: '/definitely-missing-maestro',
      exists: () => false,
      required: false,
    })
    assert.equal(report.ok, true)
    assert.equal(report.skipped, true)
    assert.deepEqual(report.problems, [])
  })

  it('fails closed on an unknown tapOn timeout property', { skip: !hasMaestro }, () => {
    const root = mkdtempSync(join(tmpdir(), 'maestro-syntax-'))
    try {
      const flowPath = join(root, 'bad.yaml')
      writeFileSync(
        flowPath,
        'appId: dev.offbyonelabs.coffeecompanion\n---\n- tapOn:\n    text: Continue\n    timeout: 2000\n',
      )
      const report = inspectMaestroFlows({ flows: [flowPath] })
      assert.equal(report.ok, false)
      assert.ok(
        report.problems.some((problem) => /Unknown Property: timeout/i.test(problem)),
        report.problems.join('\n'),
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('parseMaestroFailedStep', () => {
  it('reads the failed command from Maestro CLI output', () => {
    assert.equal(
      parseMaestroFailedStep(`
Running on emulator-5554
 ✅  Launch app
 ✅  Open link
 ❌  Assert that id: welcome-screen is visible
Element not found: Id matching regex: welcome-screen
`),
      'Assert that id: welcome-screen is visible',
    )
    assert.equal(
      parseMaestroFailedStep('Element not found: Text matching regex: Runtime version.*\n'),
      'Element not found: Text matching regex: Runtime version.*',
    )
    assert.equal(parseMaestroFailedStep('all good\n'), null)
  })
})

describe('maestroLogTail', () => {
  it('keeps the last lines', () => {
    assert.equal(maestroLogTail('a\nb\nc\n', 2), 'b\nc')
  })
})

describe('maestroFailureMessage', () => {
  it('names the failed step and the saved log path', () => {
    const dest = '/tmp/artifacts/run/sign-in-and-out'
    const message = maestroFailureMessage({
      flow: 'sign-in-and-out',
      dest,
      step: 'Assert that id: welcome-screen is visible',
      tail: ' ❌  Assert that id: welcome-screen is visible',
      screenshotPath: join(dest, DEVICE_FAILURE_SCREENSHOT),
      dumpPath: join(dest, DEVICE_FAILURE_DUMP),
    })
    assert.match(message, /Failed step: Assert that id: welcome-screen is visible/)
    assert.match(message, new RegExp(MAESTRO_LOG_NAME))
    assert.equal(maestroLogPath(dest), join(dest, MAESTRO_LOG_NAME))
    assert.match(message, /Maestro log tail:/)
  })

  it('prints an auth error summary and extra artifact paths', () => {
    const dest = '/tmp/artifacts/run/sign-in-and-out'
    const message = maestroFailureMessage({
      flow: 'sign-in-and-out',
      dest,
      step: 'Assert that id: welcome-screen is visible',
      authSummary: 'still on sign-in-screen; Network request failed',
      screenshotPath: join(dest, DEVICE_FAILURE_SCREENSHOT),
      dumpPath: join(dest, DEVICE_FAILURE_DUMP),
      webLogPath: join(dest, DEVICE_FAILURE_WEB_LOG),
      logcatPath: join(dest, DEVICE_FAILURE_LOGCAT),
    })
    assert.match(message, /Auth error: still on sign-in-screen/)
    assert.match(message, new RegExp(DEVICE_FAILURE_WEB_LOG))
    assert.match(message, new RegExp(DEVICE_FAILURE_LOGCAT))
  })
})

describe('summarizeAuthFailure', () => {
  it('names a leftover sign-in screen and a React Native network error', () => {
    const summary = summarizeAuthFailure({
      dump: `<node content-desc="${SIGN_IN_TEST_ID}"/>`,
      logcat: 'ReactNativeJS: Network request failed',
      webLog: '',
    })
    assert.match(summary, /still on sign-in-screen/)
    assert.match(summary, /Network request failed/)
  })

  it('includes the exact sign-in error and app get-session status', () => {
    const summary = summarizeAuthFailure({
      dump: `<node content-desc="${SIGN_IN_TEST_ID}"/><node content-desc="sign-in-error"><node text="We couldn't sign you in. Try again."/><node text="E2E get-session returned no session"/></node>`,
      logcat: '',
      webLog: `${JSON.stringify({
        method: 'GET',
        path: '/api/auth/get-session',
        status: 200,
        requestId: 'host',
      })}\n${JSON.stringify({
        method: 'GET',
        path: '/api/auth/get-session',
        status: 403,
        expoOrigin: 'coffeecompanion:///127.0.0.1:8081',
        requestId: 'app',
      })}\n`,
    })
    assert.match(summary, /still on sign-in-screen/)
    assert.match(summary, /E2E get-session returned no session/)
    assert.match(summary, /app get-session status 403/)
    assert.doesNotMatch(summary, /app get-session status 200/)
  })

  it('reads app get-session status from pino-pretty request lines', () => {
    const summary = summarizeAuthFailure({
      dump: `<node content-desc="${SIGN_IN_TEST_ID}"/>`,
      logcat: '',
      webLog: `[16:00:00] INFO: request
    method: "GET"
    path: "/api/auth/get-session"
    status: 200
    expoOrigin: "coffeecompanion:///127.0.0.1:8081"
`,
    })
    assert.match(summary, /app get-session status 200/)
    assert.match(summary, /get-session 200 but null session/)
  })

  it('flags a 200 get-session whose body had no user', () => {
    const summary = summarizeAuthFailure({
      dump: `<node content-desc="${SIGN_IN_TEST_ID}"/>`,
      logcat:
        'ReactNativeJS: [auth] request http://127.0.0.1:3910/api/auth/get-session status=200 e2e-auth=1 session=null',
      webLog: `${JSON.stringify({
        method: 'GET',
        path: '/api/auth/get-session',
        status: 200,
        expoOrigin: 'coffeecompanion:///127.0.0.1:8081',
        e2eAuth: true,
        sessionUser: null,
      })}\n`,
    })
    assert.match(summary, /get-session 200 but null session/)
  })
})
