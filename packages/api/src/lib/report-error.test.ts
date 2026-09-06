import { afterEach, describe, expect, it, vi } from 'vitest'
import { reportError, setErrorCapture } from './report-error'

describe('reportError', () => {
  afterEach(() => {
    setErrorCapture(null)
  })

  it('does nothing when no capture is wired', () => {
    expect(() => reportError(new Error('unreachable'))).not.toThrow()
  })

  it('forwards the error and its tags once a capture is wired', () => {
    const capture = vi.fn()
    setErrorCapture(capture)
    const error = new Error('unreachable')

    reportError(error, { area: 'billing', operation: 'planPrices' })

    expect(capture).toHaveBeenCalledWith(error, {
      area: 'billing',
      operation: 'planPrices',
    })
  })
})
