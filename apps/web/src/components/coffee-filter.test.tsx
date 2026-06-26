import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { CoffeeFilter } from '@/components/coffee-filter'

// Mock the cmdk command primitives with plain elements so we can unit-test
// CoffeeFilter's own logic (open/select/toggle) without cmdk's browser-only
// internals (ResizeObserver etc.). The real cmdk integration is covered by e2e.
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

const options = [
  { value: 'onyx', label: 'Onyx Coffee Lab' },
  { value: 'sey', label: 'Sey' },
]

function Harness({
  value = '',
  onChange,
}: {
  value?: string
  onChange?: (value: string) => void
}) {
  const [selected, setSelected] = useState(value)
  return (
    <CoffeeFilter
      options={options}
      value={selected}
      onChange={(next) => {
        setSelected(next)
        onChange?.(next)
      }}
    />
  )
}

function open() {
  return act(async () => {
    fireEvent.click(screen.getByRole('button'))
  })
}

describe('CoffeeFilter', () => {
  it('shows "All coffees" when nothing is selected', () => {
    render(<Harness />)
    expect(screen.getByRole('button').textContent).toContain('All coffees')
  })

  it('shows the selected option label', () => {
    render(<Harness value="onyx" />)
    expect(screen.getByRole('button').textContent).toContain('Onyx Coffee Lab')
  })

  it('toggles the dropdown open and closed from the button', async () => {
    render(<Harness />)
    expect(screen.queryByPlaceholderText('Search coffees...')).toBeNull()
    await open()
    expect(screen.getByPlaceholderText('Search coffees...')).toBeTruthy()
    await open()
    expect(screen.queryByPlaceholderText('Search coffees...')).toBeNull()
  })

  it('selects an option and closes the dropdown', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    await open()
    await act(async () => {
      fireEvent.click(screen.getByText('Sey'))
    })
    expect(onChange).toHaveBeenCalledWith('sey')
    expect(screen.queryByPlaceholderText('Search coffees...')).toBeNull()
    expect(screen.getByRole('button').textContent).toContain('Sey')
  })

  it('clears the filter when "All coffees" is selected', async () => {
    const onChange = vi.fn()
    render(<Harness value="onyx" onChange={onChange} />)
    await open()
    await act(async () => {
      fireEvent.click(screen.getByText('All coffees'))
    })
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('toggles the filter off when the selected option is re-selected', async () => {
    const onChange = vi.fn()
    render(<Harness value="onyx" onChange={onChange} />)
    await open()
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: /Onyx Coffee Lab/ }))
    })
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('closes when focus leaves the container', async () => {
    render(<Harness />)
    await open()
    await act(async () => {
      fireEvent.blur(screen.getByRole('button'), { relatedTarget: null })
    })
    expect(screen.queryByPlaceholderText('Search coffees...')).toBeNull()
  })

  it('stays open when focus moves within the container', async () => {
    render(<Harness />)
    await open()
    const container = screen.getByRole('button').parentElement!
    await act(async () => {
      fireEvent.blur(screen.getByRole('button'), {
        relatedTarget: container,
      })
    })
    expect(screen.getByPlaceholderText('Search coffees...')).toBeTruthy()
  })
})
