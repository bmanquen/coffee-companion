import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { describe, it } from 'node:test'
import {
  APP_MARKER,
  BUNDLE_PATHS,
  METRO_READY_MARKER,
  bundleHasAppMarker,
  fetchAppBundle,
  inspectMetro,
  isMetroReady,
  waitForMetro,
} from './control.mjs'

describe('isMetroReady', () => {
  it('accepts the Expo packager status line', () => {
    assert.equal(isMetroReady(METRO_READY_MARKER), true)
  })

  it('rejects an empty or unrelated body', () => {
    assert.equal(isMetroReady(''), false)
    assert.equal(isMetroReady('ok'), false)
  })
})

describe('bundleHasAppMarker', () => {
  it('finds the welcome copy in a Metro bundle body', () => {
    assert.equal(bundleHasAppMarker(`var x = "${APP_MARKER}"`), true)
  })

  it('rejects a bundle that is not this app', () => {
    assert.equal(bundleHasAppMarker('export default function App() {}'), false)
  })
})

describe('inspectMetro', () => {
  it('fails closed when the recorded Metro is not answering', async () => {
    const report = await inspectMetro(
      {
        metroPid: 999_999_999,
        port: 59_999,
        baseUrl: 'http://localhost:59999',
        bundleUrl: 'http://localhost:59999/apps/mobile/index.bundle',
      },
      250,
    )
    assert.equal(report.ok, false)
    assert.ok(
      report.problems.some((problem) => problem.includes('is not running')),
    )
    assert.ok(
      report.problems.some(
        (problem) =>
          problem.includes('nothing is listening') ||
          problem.includes('/status failed') ||
          problem.includes('bundle check failed'),
      ),
    )
  })
})

describe('waitForMetro', () => {
  it('returns the IPv4 base URL once /status is packager-status:running', async () => {
    const server = createServer((req, res) => {
      if (req.url === '/status') {
        res.writeHead(200, { 'content-type': 'text/plain' })
        res.end(METRO_READY_MARKER)
        return
      }
      res.writeHead(404)
      res.end()
    })
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', resolve)
    })
    const { port } = server.address()
    try {
      const ready = await waitForMetro({ port, timeoutMs: 2_000 })
      assert.equal(ready.baseUrl, `http://127.0.0.1:${port}`)
    } finally {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
    }
  })

  it('fails with the Metro log tail when the process is already dead', async () => {
    await assert.rejects(
      () =>
        waitForMetro({
          port: 59_998,
          timeoutMs: 500,
          pid: 999_999_999,
          exit: { died: true },
          logPath: undefined,
        }),
      /exited before/,
    )
  })
})

describe('fetchAppBundle', () => {
  it('uses /index.bundle relative to the apps/mobile Metro root', async () => {
    const server = createServer((req, res) => {
      if (req.url?.startsWith('/index.bundle')) {
        res.writeHead(200, { 'content-type': 'text/javascript' })
        res.end(`var title = "${APP_MARKER}"`)
        return
      }
      res.writeHead(404)
      res.end('missing')
    })
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', resolve)
    })
    const { port } = server.address()
    try {
      const bundle = await fetchAppBundle(`http://127.0.0.1:${port}`, 2_000)
      assert.equal(
        bundle.url,
        `http://127.0.0.1:${port}${BUNDLE_PATHS[0]}`,
      )
      assert.equal(bundleHasAppMarker(bundle.body), true)
    } finally {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
    }
  })

  it('returns within the budget when the bundle endpoint stalls', async () => {
    const server = createServer(() => {})
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', resolve)
    })
    const { port } = server.address()
    const budgetMs = 400
    const started = Date.now()
    try {
      await assert.rejects(
        () => fetchAppBundle(`http://127.0.0.1:${port}`, budgetMs),
        /Timed out waiting for an app bundle/,
      )
      const elapsed = Date.now() - started
      assert.ok(
        elapsed <= budgetMs + 1_000,
        `stalled fetch took ${elapsed}ms; budget was ${budgetMs}ms`,
      )
    } finally {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
    }
  })
})
