import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDelayedFlag } from './use-delayed-flag'

describe('useDelayedFlag', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('stays false until the delay elapses, then turns true', () => {
    const { result } = renderHook(() => useDelayedFlag(true, 150))

    expect(result.current).toBe(false)
    act(() => vi.advanceTimersByTime(149))
    expect(result.current).toBe(false)
    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe(true)
  })

  it('never turns true when active clears before the delay (no flash)', () => {
    const { result, rerender } = renderHook(
      ({ active }) => useDelayedFlag(active, 150),
      { initialProps: { active: true } },
    )

    act(() => vi.advanceTimersByTime(100))
    rerender({ active: false })
    act(() => vi.advanceTimersByTime(100))
    expect(result.current).toBe(false)
  })

  it('resets to false once active clears', () => {
    const { result, rerender } = renderHook(
      ({ active }) => useDelayedFlag(active, 150),
      { initialProps: { active: true } },
    )

    act(() => vi.advanceTimersByTime(150))
    expect(result.current).toBe(true)
    rerender({ active: false })
    expect(result.current).toBe(false)
  })
})
