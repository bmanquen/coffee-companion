import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import {
  parseAdbDevices,
  parseDumpsysVersionName,
  parseAvdName,
  recordedPids,
  copyPngFiles,
  DEVICE_SERIAL,
  AVD_NAME,
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
