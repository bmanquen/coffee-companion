import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Resvg } from '@resvg/resvg-js'

import { APP_ICON_EXPORTS, APP_ICON_SOURCE } from './app-icon-exports'

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

// resvg ships its native binary with the npm package, so `pnpm install` is
// enough. Playwright's Chromium download is a separate step and is not.

function rasterPng(svg: Buffer, size: number) {
  return Buffer.from(
    new Resvg(svg, {
      background: 'transparent',
      fitTo: { mode: 'width', value: size },
    })
      .render()
      .asPng(),
  )
}

// ICO is a directory of images. PNG-in-ICO is what the committed scaffold
// already used (16/24/32/64), so the tab file stays the same container.
function pngsToIco(images: Array<{ size: number; png: Buffer }>) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)

  const directories: Array<Buffer> = []
  let offset = 6 + 16 * images.length
  for (const { size, png } of images) {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size, 0)
    entry.writeUInt8(size, 1)
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    directories.push(entry)
    offset += png.length
  }

  return Buffer.concat([
    header,
    ...directories,
    ...images.map((image) => image.png),
  ])
}

export function exportAppIcon(destDir = join(webRoot, 'public')) {
  const svg = readFileSync(join(webRoot, APP_ICON_SOURCE))
  mkdirSync(destDir, { recursive: true })

  for (const exp of APP_ICON_EXPORTS) {
    if (exp.format === 'png') {
      writeFileSync(join(destDir, exp.file), rasterPng(svg, exp.size))
      continue
    }

    writeFileSync(
      join(destDir, exp.file),
      pngsToIco(exp.sizes.map((size) => ({ size, png: rasterPng(svg, size) }))),
    )
  }
}

const invokedDirectly = process.argv[1]?.includes('export-app-icon')
if (invokedDirectly) {
  exportAppIcon()
}
