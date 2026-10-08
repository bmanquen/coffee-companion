import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  APP_MARKER,
  METRO_READY_MARKER,
  bundleHasAppMarker,
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
