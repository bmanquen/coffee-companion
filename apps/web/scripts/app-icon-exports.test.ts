import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'
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

function paethPredictor(left: number, up: number, upLeft: number) {
  const p = left + up - upLeft
  const pa = Math.abs(p - left)
  const pb = Math.abs(p - up)
  const pc = Math.abs(p - upLeft)
  if (pa <= pb && pa <= pc) return left
  if (pb <= pc) return up
  return upLeft
}

function decodePngRgba(bytes: Buffer) {
  expect(bytes[24]).toBe(8)
  expect(bytes[25]).toBe(6)

  const { width, height } = pngSize(bytes)
  const idats: Array<Buffer> = []
  let offset = 8
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset)
    const type = bytes.subarray(offset + 4, offset + 8).toString('ascii')
    if (type === 'IDAT') {
      idats.push(bytes.subarray(offset + 8, offset + 8 + length))
    }
    offset += 12 + length
  }

  const raw = inflateSync(Buffer.concat(idats))
  const stride = width * 4
  const pixels = Buffer.alloc(height * stride)
  let src = 0
  for (let row = 0; row < height; row++) {
    const filter = raw[src++]
    const dest = row * stride
    for (let i = 0; i < stride; i++) {
      const byte = raw[src++]
      const left = i >= 4 ? pixels[dest + i - 4] : 0
      const up = row > 0 ? pixels[dest - stride + i] : 0
      const upLeft = row > 0 && i >= 4 ? pixels[dest - stride + i - 4] : 0
      let recon = byte
      if (filter === 1) recon = (byte + left) & 255
      else if (filter === 2) recon = (byte + up) & 255
      else if (filter === 3) recon = (byte + Math.floor((left + up) / 2)) & 255
      else if (filter === 4)
        recon = (byte + paethPredictor(left, up, upLeft)) & 255
      else if (filter !== 0) throw new Error(`unsupported PNG filter ${filter}`)
      pixels[dest + i] = recon
    }
  }

  return { width, height, pixels }
}

function pngRgbaAt(
  png: { width: number; pixels: Buffer },
  x: number,
  y: number,
) {
  const i = (y * png.width + x) * 4
  return {
    r: png.pixels[i],
    g: png.pixels[i + 1],
    b: png.pixels[i + 2],
    a: png.pixels[i + 3],
  }
}

function icoPngs(bytes: Buffer) {
  expect(bytes.readUInt16LE(0)).toBe(0)
  expect(bytes.readUInt16LE(2)).toBe(1)
  const count = bytes.readUInt16LE(4)
  const images: Array<{ size: number; png: Buffer }> = []
  for (let i = 0; i < count; i++) {
    const entry = 6 + i * 16
    const size = bytes.readUInt8(entry)
    const byteCount = bytes.readUInt32LE(entry + 8)
    const offset = bytes.readUInt32LE(entry + 12)
    images.push({
      size,
      png: bytes.subarray(offset, offset + byteCount),
    })
  }
  return images
}

function icoImageSizes(bytes: Buffer) {
  return icoPngs(bytes).map(({ size, png }) => {
    expect(pngSize(png), `${size}x${size}`).toEqual({
      width: size,
      height: size,
    })
    return size
  })
}

function expectRoundedCornersStay(bytes: Buffer, label: string) {
  // Five samples used to inflate the 1024² scanlines five times and blow
  // Vitest's 5s default on a loaded CI runner. Decode once, then sample.
  const png = decodePngRgba(bytes)
  expect(pngRgbaAt(png, 0, 0).a, `${label} top-left`).toBe(0)
  expect(pngRgbaAt(png, png.width - 1, 0).a, `${label} top-right`).toBe(0)
  expect(pngRgbaAt(png, 0, png.height - 1).a, `${label} bottom-left`).toBe(0)
  expect(
    pngRgbaAt(png, png.width - 1, png.height - 1).a,
    `${label} bottom-right`,
  ).toBe(0)
  expect(
    pngRgbaAt(png, Math.floor(png.width / 2), Math.floor(png.height / 2)).a,
    `${label} center`,
  ).toBe(255)
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
      expectRoundedCornersStay(bytes, exp.file)
    }
  })

  it('emits favicon.ico at the small sizes the manifest already lists', () => {
    const ico = APP_ICON_EXPORTS.find((exp) => exp.format === 'ico')
    expect(ico?.file).toBe('favicon.ico')
    expect(ico?.sizes).toEqual([16, 24, 32, 64])

    const bytes = readFileSync(join(webRoot, 'public', 'favicon.ico'))
    expect(icoImageSizes(bytes)).toEqual([16, 24, 32, 64])
    for (const image of icoPngs(bytes)) {
      expectRoundedCornersStay(
        image.png,
        `favicon.ico ${image.size}x${image.size}`,
      )
    }
  })

  it('rasterizes those files after a normal install, without a browser', () => {
    // 1024 and the ico set are a `pnpm export:app-icon` job. Rasterizing
    // them here, then inflating the 1024² scanlines for corner samples,
    // blew Vitest's 5s default on CI. One PWA size still proves resvg
    // works after a normal install, without Chromium.
    const sample = {
      file: 'logo192.png',
      size: 192,
      format: 'png' as const,
    }
    expect(APP_ICON_EXPORTS).toContainEqual(sample)

    const dest = mkdtempSync(join(tmpdir(), 'app-icon-'))
    try {
      exportAppIcon(dest, [sample])
      const bytes = readFileSync(join(dest, sample.file))
      expect(pngSize(bytes), sample.file).toEqual({
        width: sample.size,
        height: sample.size,
      })
      expectRoundedCornersStay(bytes, sample.file)
      expect(bytes).toEqual(readFileSync(join(webRoot, 'public', sample.file)))
    } finally {
      rmSync(dest, { recursive: true, force: true })
    }
  })
})
