import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { APP_ICON_EXPORTS, APP_ICON_SOURCE } from './app-icon-exports'
import { exportAppIcon } from './export-app-icon'

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

function pngSize(bytes: Buffer) {
  expect(bytes.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  )
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  }
}

function icoImageSizes(bytes: Buffer) {
  expect(bytes.readUInt16LE(0)).toBe(0)
  expect(bytes.readUInt16LE(2)).toBe(1)
  const count = bytes.readUInt16LE(4)
  const sizes: Array<number> = []
  for (let i = 0; i < count; i++) {
    const entry = 6 + i * 16
    const width = bytes.readUInt8(entry)
    const height = bytes.readUInt8(entry + 1)
    const byteCount = bytes.readUInt32LE(entry + 8)
    const offset = bytes.readUInt32LE(entry + 12)
    expect(
      pngSize(bytes.subarray(offset, offset + byteCount)),
      `${width}x${height}`,
    ).toEqual({
      width,
      height,
    })
    sizes.push(width)
  }
  return sizes
}

describe('app icon exports', () => {
  it('uses the locked cream tile and rust bean as the source', () => {
    const svg = readFileSync(join(webRoot, APP_ICON_SOURCE), 'utf8')

    expect(svg).toContain('viewBox="0 0 1024 1024"')
    expect(svg).toContain('rx="227"')
    expect(svg).toContain('#FDFAF7')
    expect(svg).toContain('#E6DCCF')
    expect(svg).toContain('#C4703F')
    expect(svg).toContain('#2D4A3E')
    expect(svg).not.toContain('c2pa')
  })

  it('emits a PNG at each store and listing size', () => {
    for (const exp of APP_ICON_EXPORTS) {
      if (exp.format !== 'png') continue
      const bytes = readFileSync(join(webRoot, 'public', exp.file))
      expect(pngSize(bytes), exp.file).toEqual({
        width: exp.size,
        height: exp.size,
      })
    }
  })

  it('emits favicon.ico at the small sizes the manifest already lists', () => {
    const ico = APP_ICON_EXPORTS.find((exp) => exp.format === 'ico')
    expect(ico?.file).toBe('favicon.ico')
    expect(ico?.sizes).toEqual([16, 24, 32, 64])

    const bytes = readFileSync(join(webRoot, 'public', 'favicon.ico'))
    expect(icoImageSizes(bytes)).toEqual([16, 24, 32, 64])
  })

  it('rasterizes those files after a normal install, without a browser', () => {
    const dest = mkdtempSync(join(tmpdir(), 'app-icon-'))
    try {
      exportAppIcon(dest)
      for (const exp of APP_ICON_EXPORTS) {
        const bytes = readFileSync(join(dest, exp.file))
        if (exp.format === 'png') {
          expect(pngSize(bytes), exp.file).toEqual({
            width: exp.size,
            height: exp.size,
          })
        } else {
          expect(icoImageSizes(bytes), exp.file).toEqual([16, 24, 32, 64])
        }
      }
      // Drift check: a forgotten regen would leave the scaffold .ico committed.
      expect(readFileSync(join(dest, 'favicon.ico'))).toEqual(
        readFileSync(join(webRoot, 'public', 'favicon.ico')),
      )
    } finally {
      rmSync(dest, { recursive: true, force: true })
    }
  })
})
