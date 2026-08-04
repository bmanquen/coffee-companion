import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useAccordionExpansion } from './use-accordion-expansion'
import type { ExpandedState } from '@tanstack/react-table'

// TanStack drives expansion through an updater that may be either a value or a
// function of the previous state, so both forms are exercised here.
describe('useAccordionExpansion', () => {
  it('starts with nothing expanded', () => {
    const { result } = renderHook(() => useAccordionExpansion())

    expect(result.current.expanded).toEqual({})
  })

  it('opens a row', () => {
    const { result } = renderHook(() => useAccordionExpansion())

    act(() => result.current.onExpandedChange({ a: true }))

    expect(result.current.expanded).toEqual({ a: true })
  })

  it('collapses whichever row was open when another opens — the accordion rule', () => {
    const { result } = renderHook(() => useAccordionExpansion())
    act(() => result.current.onExpandedChange({ a: true }))

    act(() => result.current.onExpandedChange({ a: true, b: true }))

    expect(result.current.expanded).toEqual({ b: true })
  })

  it('closes the open row when it is toggled off, leaving nothing expanded', () => {
    const { result } = renderHook(() => useAccordionExpansion())
    act(() => result.current.onExpandedChange({ a: true }))

    act(() => result.current.onExpandedChange({}))

    expect(result.current.expanded).toEqual({})
  })

  it('accepts a function updater, which is how the table usually reports a toggle', () => {
    const { result } = renderHook(() => useAccordionExpansion())
    act(() => result.current.onExpandedChange({ a: true }))

    act(() =>
      result.current.onExpandedChange((old) => ({
        ...(old as Record<string, boolean>),
        b: true,
      })),
    )

    expect(result.current.expanded).toEqual({ b: true })
  })

  it('treats expand-all as nothing newly opened rather than throwing', () => {
    const { result } = renderHook(() => useAccordionExpansion())
    act(() => result.current.onExpandedChange({ a: true }))

    // `true` means every row; the hook never sets it, but the type allows it.
    act(() => result.current.onExpandedChange(true as ExpandedState))

    expect(result.current.expanded).toEqual({})
  })

  it('ignores a row explicitly marked closed rather than counting it as open', () => {
    const { result } = renderHook(() => useAccordionExpansion())

    act(() => result.current.onExpandedChange({ a: false }))

    expect(result.current.expanded).toEqual({})
  })
})
