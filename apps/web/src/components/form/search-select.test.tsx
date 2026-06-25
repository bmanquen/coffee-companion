import type { ReactNode } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAppForm } from '@/hooks/form'

// Mock the cmdk command primitives with plain elements so we can unit-test
// SearchSelect's own logic (open/select/add) without cmdk's browser-only
// internals (ResizeObserver etc.). The real cmdk integration is covered by e2e.
vi.mock('@/components/ui/command', () => ({
  Command: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandEmpty: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandSeparator: () => <hr />,
  CommandInput: ({
    value,
    onValueChange,
    placeholder,
  }: {
    value: string
    onValueChange: (value: string) => void
    placeholder?: string
  }) => (
    <input
      placeholder={placeholder}
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
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

const options = [
  { value: 'onyx', label: 'Onyx Coffee Lab' },
  { value: 'sey', label: 'Sey' },
]

function Harness({
  value,
  onAddItem,
}: {
  value?: string
  onAddItem?: (value: string) => { value: string; label: string }
}) {
  const form = useAppForm({ defaultValues: { roasterId: value ?? '' } })
  return (
    <form.AppField name="roasterId">
      {(field) => (
        <field.SearchSelect
          label="Roaster"
          options={options}
          onAddItem={onAddItem}
        />
      )}
    </form.AppField>
  )
}

describe('SearchSelect', () => {
  it('shows the placeholder when nothing is selected', () => {
    render(<Harness />)
    expect(screen.getByText('Select Roaster')).toBeTruthy()
  })

  it('shows the selected option label', () => {
    render(<Harness value="onyx" />)
    expect(screen.getByText('Onyx Coffee Lab')).toBeTruthy()
  })

  it('opens the dropdown and selects an option', async () => {
    render(<Harness />)
    await act(async () => {
      fireEvent.click(screen.getByText('Select Roaster'))
    })
    await act(async () => {
      fireEvent.click(screen.getByText('Sey'))
    })
    expect(screen.getByText('Sey')).toBeTruthy()
    expect(screen.queryByText('Select Roaster')).toBeNull()
  })

  it('adds a new option via onAddItem', async () => {
    const onAddItem = vi.fn((value: string) => ({ value: 'new', label: value }))
    render(<Harness onAddItem={onAddItem} />)
    await act(async () => {
      fireEvent.click(screen.getByText('Select Roaster'))
    })
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Search...'), {
        target: { value: 'Heart' },
      })
    })
    await act(async () => {
      fireEvent.mouseDown(screen.getByRole('button', { name: /Add/ }))
    })
    expect(onAddItem).toHaveBeenCalledWith('Heart')
  })
})
