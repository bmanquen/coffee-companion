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
    for (const { file, size } of APP_ICON_EXPORTS) {
      const bytes = readFileSync(join(webRoot, 'public', file))
      expect(pngSize(bytes), file).toEqual({ width: size, height: size })
    }
  })

  it('rasterizes those PNGs after a normal install, without a browser', () => {
    const dest = mkdtempSync(join(tmpdir(), 'app-icon-'))
    try {
      exportAppIcon(dest)
      for (const { file, size } of APP_ICON_EXPORTS) {
        const bytes = readFileSync(join(dest, file))
        expect(pngSize(bytes), file).toEqual({ width: size, height: size })
      }
    } finally {
      rmSync(dest, { recursive: true, force: true })
    }
  })
})
