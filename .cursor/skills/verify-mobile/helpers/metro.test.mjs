import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  APP_MARKER,
  METRO_READY_MARKER,
  bundleHasAppMarker,
  inspectMetro,
  isMetroReady,
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
