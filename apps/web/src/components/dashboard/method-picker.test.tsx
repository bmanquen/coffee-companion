import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MethodPicker } from './method-picker'
import type { ReactNode } from 'react'
import type { DashboardMethod, MethodFeed } from './methods'

// Mock the cmdk command primitives with plain elements, as search-select.test
// does, so this can unit-test MethodPicker's own open/close/select logic
// without cmdk's browser-only internals (ResizeObserver etc.). The real cmdk
// integration is covered by e2e.
vi.mock('@/components/ui/command', () => ({
  Command: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandGroup: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  CommandEmpty: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  CommandInput: ({ placeholder }: { placeholder?: string }) => (
    <input placeholder={placeholder} />
  ),
  CommandItem: ({
    children,
    onSelect,
  }: {
    children: ReactNode
    onSelect?: () => void
  }) => (
    <div role="option" onClick={() => onSelect?.()}>
      {children}
    </div>
  ),
}))

// A fixed `now` so "last brewed" never depends on when the suite runs.
const NOW = new Date('2026-03-01T12:00:00Z')

// Only espresso has been brewed; the picker lists every method regardless, so
// the rest fall back to "No brews yet".
const feeds = [
  {
    method: 'espresso' as DashboardMethod,
    brews: [{ createdAt: new Date('2026-02-28T12:00:00Z') }],
  },
  { method: 'pourover' as DashboardMethod, brews: [] },
] as unknown as Array<MethodFeed>

function renderPicker() {
  const onSelectMethod = vi.fn()
  render(
    <MethodPicker
      selectedMethod={'espresso' as DashboardMethod}
      onSelectMethod={onSelectMethod}
      feeds={feeds}
      now={NOW}
    />,
  )
  const trigger = screen.getByRole('button')
  return { onSelectMethod, trigger, container: trigger.parentElement! }
}

describe('MethodPicker', () => {
  it('shows the selected method and keeps the list closed until asked', () => {
    const { trigger } = renderPicker()

    expect(trigger.textContent).toContain('Espresso')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('option')).toBeNull()
  })

  it('opens on click and lists every method, brewed or not', () => {
    const { trigger } = renderPicker()

    fireEvent.click(trigger)

    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    // A method with no brews is still offered — that is the point of a picker
    // with a fixed footprint rather than a tab row of what exists.
    const labels = screen.getAllByRole('option').map((o) => o.textContent)
    expect(labels.some((l) => l.includes('Pour Over'))).toBe(true)
    expect(labels.filter((l) => l.includes('No brews yet')).length).toBe(
      labels.length - 1,
    )
  })

  it('reports the chosen method and closes', () => {
    const { trigger, onSelectMethod } = renderPicker()
    fireEvent.click(trigger)

    fireEvent.click(screen.getByText('Pour Over'))

    expect(onSelectMethod).toHaveBeenCalledWith('pourover')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  // The dropdown is not a modal, so nothing else dismisses it: without this the
  // list would stay open behind whatever the user moved on to.
  it('closes when focus leaves the picker entirely', () => {
    const { trigger, container } = renderPicker()
    fireEvent.click(trigger)

    fireEvent.blur(container, { relatedTarget: document.body })

    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('stays open while focus moves within the picker', () => {
    const { trigger, container } = renderPicker()
    fireEvent.click(trigger)

    fireEvent.blur(container, {
      relatedTarget: screen.getByPlaceholderText('Search methods...'),
    })

    expect(trigger.getAttribute('aria-expanded')).toBe('true')
  })
})
