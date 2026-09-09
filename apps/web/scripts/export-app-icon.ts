import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Resvg } from '@resvg/resvg-js'

import { APP_ICON_EXPORTS, APP_ICON_SOURCE } from './app-icon-exports'

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

// resvg ships its native binary with the npm package, so `pnpm install` is
// enough. Playwright's Chromium download is a separate step and is not.

export function exportAppIcon(destDir = join(webRoot, 'public')) {
  const svg = readFileSync(join(webRoot, APP_ICON_SOURCE))
  mkdirSync(destDir, { recursive: true })

  for (const { file, size } of APP_ICON_EXPORTS) {
    const png = new Resvg(svg, {
      background: '#ffffff',
      fitTo: { mode: 'width', value: size },
    })
      .render()
      .asPng()
    writeFileSync(join(destDir, file), png)
  }
}

const invokedDirectly = process.argv[1]?.includes('export-app-icon')
if (invokedDirectly) {
  exportAppIcon()
}
