import { afterEach, describe, expect, it, vi } from 'vitest'
import { log, setLogSink } from './log'

describe('log', () => {
  afterEach(() => {
    setLogSink(null)
  })

  it('does nothing when no sink is wired', () => {
    expect(() =>
      log('info', 'procedure', { path: 'coffee.getAll' }),
    ).not.toThrow()
  })

  it('forwards the level, the message, and the fields once a sink is wired', () => {
    const sink = vi.fn()
    setLogSink(sink)

    log('warn', 'procedure', { path: 'coffee.getAll', code: 'UNAUTHORIZED' })

    expect(sink).toHaveBeenCalledWith('warn', 'procedure', {
      path: 'coffee.getAll',
      code: 'UNAUTHORIZED',
    })
  })

  it('carries no fields when none are given', () => {
    const sink = vi.fn()
    setLogSink(sink)

    log('info', 'procedure')

    expect(sink).toHaveBeenCalledWith('info', 'procedure', {})
  })
})
