import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from '@playwright/test'

import { APP_ICON_EXPORTS, APP_ICON_SOURCE } from './app-icon-exports'

// Headless Chromium, not a library rasterizer: icon.svg documents that the
// committed PNGs are browser renders at the target size.

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

async function exportAppIcon() {
  const svg = readFileSync(join(webRoot, APP_ICON_SOURCE), 'utf8')
  const browser = await chromium.launch()

  try {
    for (const { file, size } of APP_ICON_EXPORTS) {
      const page = await browser.newPage({
        deviceScaleFactor: 1,
        viewport: { width: size, height: size },
      })
      await page.setContent(`<!doctype html>
<html>
  <head>
    <style>
      html,
      body {
        margin: 0;
        width: ${size}px;
        height: ${size}px;
        background: #ffffff;
      }
      svg {
        display: block;
        width: ${size}px;
        height: ${size}px;
      }
    </style>
  </head>
  <body>
    ${svg}
  </body>
</html>`)
      const png = await page.screenshot({
        clip: { x: 0, y: 0, width: size, height: size },
        omitBackground: false,
        type: 'png',
      })
      writeFileSync(join(webRoot, 'public', file), png)
      await page.close()
    }
  } finally {
    await browser.close()
  }
}

await exportAppIcon()
