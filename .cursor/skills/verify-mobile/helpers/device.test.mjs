import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import {
  parseAdbDevices,
  parseDumpsysVersionName,
  parseAvdName,
  parseEmulatorAvdList,
  chosenAvdName,
  requireAvd,
  bootWaitTick,
  chosenDeviceWebPort,
  deviceApiUrl,
  deviceExpoPublicEnv,
  webLaunchEnv,
  missingStateMessage,
  recordedPids,
  copyPngFiles,
  DEVICE_SERIAL,
  AVD_NAME,
  DEFAULT_DEVICE_WEB_PORT,
  E2E_USER_WITH_DATA,
} from './control.mjs'

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

describe('chosenDeviceWebPort', () => {
  it('defaults to 3910 so it does not collide with pnpm dev on 3000', () => {
    assert.equal(chosenDeviceWebPort({}), DEFAULT_DEVICE_WEB_PORT)
    assert.equal(DEFAULT_DEVICE_WEB_PORT, 3910)
    assert.notEqual(DEFAULT_DEVICE_WEB_PORT, 3000)
  })

  it('uses VERIFY_PORT when it is set', () => {
    assert.equal(chosenDeviceWebPort({ VERIFY_PORT: '4010' }), 4010)
  })
})

describe('deviceApiUrl', () => {
  it('uses localhost so the Android emulator rewrite can map it to 10.0.2.2', () => {
    assert.equal(deviceApiUrl(3910), 'http://localhost:3910')
  })
})

describe('deviceExpoPublicEnv', () => {
  it('sets EXPO_PUBLIC_API_URL so Metro inlines the dedicated port', () => {
    const env = deviceExpoPublicEnv(3910)
    assert.equal(env.EXPO_PUBLIC_API_URL, 'http://localhost:3910')
    assert.equal(env.EXPO_PUBLIC_E2E_USER, E2E_USER_WITH_DATA)
  })
})

describe('webLaunchEnv', () => {
  it('pins VERIFY_PORT and Better Auth to the dedicated port', () => {
    const env = webLaunchEnv(3910)
    assert.equal(env.VERIFY_PORT, '3910')
    assert.equal(env.BETTER_AUTH_URL, 'http://127.0.0.1:3910')
    assert.equal(env.SITE_URL, 'http://127.0.0.1:3910')
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
