import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { APP_ICON_EXPORTS, APP_ICON_SOURCE } from './app-icon-exports'

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
  it('uses the locked cream container and pour-over glyph as the source', () => {
    const svg = readFileSync(join(webRoot, APP_ICON_SOURCE), 'utf8')

    expect(svg).toContain('viewBox="0 0 512 512"')
    expect(svg).toContain('rx="96"')
    expect(svg).toContain('fill="#f7f0e8"')
    expect(svg).toContain('stroke="#c2703f"')
    // Previous mark was a Dialed-in crosshair built from circles.
    expect(svg).not.toContain('<circle')
  })

  it('emits a PNG at each store and listing size', () => {
    for (const { file, size } of APP_ICON_EXPORTS) {
      const bytes = readFileSync(join(webRoot, 'public', file))
      expect(pngSize(bytes), file).toEqual({ width: size, height: size })
    }
  })
})
