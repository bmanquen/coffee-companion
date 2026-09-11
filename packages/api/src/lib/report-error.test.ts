import { afterEach, describe, expect, it, vi } from 'vitest'
import { reportError, setErrorCapture } from './report-error'

describe('reportError', () => {
  afterEach(() => {
    setErrorCapture(null)
  })

  it('does nothing when no capture is wired', () => {
    expect(() => reportError(new Error('unreachable'))).not.toThrow()
  })

  it('forwards the error, its tags, and the caller once a capture is wired', () => {
    const capture = vi.fn()
    setErrorCapture(capture)
    const error = new Error('unreachable')

    reportError(error, {
      tags: { area: 'billing', operation: 'planPrices' },
      user: { id: 'user_123' },
    })

    expect(capture).toHaveBeenCalledWith(error, {
      tags: { area: 'billing', operation: 'planPrices' },
      user: { id: 'user_123' },
    })
  })

  it('names no one when the report carries no user', () => {
    const capture = vi.fn()
    setErrorCapture(capture)
    const error = new Error('unreachable')

    reportError(error, { tags: { area: 'billing', operation: 'planPrices' } })

    expect(capture).toHaveBeenCalledWith(error, {
      tags: { area: 'billing', operation: 'planPrices' },
    })
  })
})
