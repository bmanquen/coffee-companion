import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BrewsMethodSelect } from './brews-method-select'
import type { ReactNode } from 'react'
import type { BrewMethod } from './methods'

// Mock the cmdk command primitives with plain elements, as MethodPicker and
// CoffeeFilter do, so this can unit-test open/close/select and the empty copy
// without cmdk's browser-only internals. The real cmdk filter is covered by e2e.
vi.mock('@/components/ui/command', () => ({
  Command: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandGroup: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  CommandEmpty: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  CommandInput: ({
    placeholder,
    value,
    onValueChange,
  }: {
    placeholder?: string
    value?: string
    onValueChange?: (value: string) => void
  }) => (
    <input
      placeholder={placeholder}
      value={value}
      onChange={(e) => onValueChange?.(e.target.value)}
    />
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

function renderSelect(selectedMethod: BrewMethod = 'espresso') {
  const onSelectMethod = vi.fn()
  render(
    <BrewsMethodSelect
      selectedMethod={selectedMethod}
      onSelectMethod={onSelectMethod}
    />,
  )
  const trigger = screen.getByLabelText('Brewing method')
  return { onSelectMethod, trigger, container: trigger.parentElement! }
}

describe('BrewsMethodSelect', () => {
  it('is labelled Brewing method and shows the selected method while closed', () => {
    const { trigger } = renderSelect()

    expect(trigger.textContent).toContain('Espresso')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('option')).toBeNull()
    expect(screen.queryByPlaceholderText('Search methods')).toBeNull()
  })

  it('opens on click and lists every method in tab order', () => {
    const { trigger } = renderSelect()

    fireEvent.click(trigger)

    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByPlaceholderText('Search methods')).toBeTruthy()
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Espresso',
      'Pour Over',
      'French Press',
      'AeroPress',
      'Cold Brew',
    ])
  })

  it('reports the chosen method and closes', () => {
    const { trigger, onSelectMethod } = renderSelect()
    fireEvent.click(trigger)

    fireEvent.click(screen.getByRole('option', { name: 'AeroPress' }))

    expect(onSelectMethod).toHaveBeenCalledWith('aeropress')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('shows the no-match copy with curly quotes around the query', () => {
    const { trigger } = renderSelect()
    fireEvent.click(trigger)

    fireEvent.change(screen.getByPlaceholderText('Search methods'), {
      target: { value: 'chemex' },
    })

    expect(screen.getByText('No methods match “chemex”.')).toBeTruthy()
  })

  it('closes when focus leaves the picker entirely', () => {
    const { trigger, container } = renderSelect()
    fireEvent.click(trigger)

    fireEvent.blur(container, { relatedTarget: document.body })

    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('stays open while focus moves within the picker', () => {
    const { trigger, container } = renderSelect()
    fireEvent.click(trigger)

    fireEvent.blur(container, {
      relatedTarget: screen.getByPlaceholderText('Search methods'),
    })

    expect(trigger.getAttribute('aria-expanded')).toBe('true')
  })
})
