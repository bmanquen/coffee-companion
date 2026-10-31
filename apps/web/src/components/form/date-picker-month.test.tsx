import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { useAppForm } from '@/hooks/form'

vi.mock('@/components/ui/popover', async () => {
  const React = await import('react')

  const Ctx = React.createContext<{
    open: boolean
    setOpen: (open: boolean) => void
  } | null>(null)

  function Popover({
    children,
    open: openProp,
    onOpenChange,
  }: {
    children: ReactNode
    open?: boolean
    onOpenChange?: (open: boolean) => void
  }) {
    const [uncontrolled, setUncontrolled] = React.useState(false)
    const isControlled = openProp !== undefined
    const open = isControlled ? openProp : uncontrolled
    const setOpen = (next: boolean) => {
      if (!isControlled) setUncontrolled(next)
      onOpenChange?.(next)
    }
    return React.createElement(
      Ctx.Provider,
      { value: { open, setOpen } },
      children,
    )
  }

  function PopoverTrigger({
    children,
  }: {
    children: ReactNode
    asChild?: boolean
  }) {
    const ctx = React.useContext(Ctx)
    if (!ctx) throw new Error('PopoverTrigger outside Popover')
    return React.createElement(
      'div',
      { onClick: () => ctx.setOpen(!ctx.open) },
      children,
    )
  }

  function PopoverContent({ children }: { children: ReactNode }) {
    const ctx = React.useContext(Ctx)
    if (!ctx?.open) return null
    return React.createElement('div', null, children)
  }

  return { Popover, PopoverTrigger, PopoverContent }
})

const SELECTED_DAY = 15
const SELECTED_DAY_NAME = new RegExp(`${SELECTED_DAY}th`)
const NEXT_MONTH_NAME = /Go to the Next Month/i

function dateInNextMonth(day: number): Date {
  const today = new Date()
  return new Date(today.getFullYear(), today.getMonth() + 1, day)
}

function Harness() {
  const form = useAppForm({
    defaultValues: { roastDate: null as string | null },
  })
  return (
    <form.AppField name="roastDate">
      {(field) => (
        <>
          <field.DatePicker label="Roast date" />
          <output data-testid="stored-roast-date">
            {JSON.stringify(field.state.value)}
          </output>
        </>
      )}
    </form.AppField>
  )
}

async function openPicker() {
  await act(async () => {
    fireEvent.click(screen.getByLabelText('Roast date'))
  })
}

describe('DatePicker month', () => {
  it('keeps a date from another month when that day is tapped again', async () => {
    const nextMonthDate = dateInNextMonth(SELECTED_DAY)
    const expectedStored = `"${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}-${String(SELECTED_DAY).padStart(2, '0')}"`
    const expectedMonth = nextMonthDate.toLocaleString('en-US', {
      month: 'long',
    })
    const expectedYear = String(nextMonthDate.getFullYear())

    render(<Harness />)
    await openPicker()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: NEXT_MONTH_NAME }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: SELECTED_DAY_NAME }))
    })

    expect(screen.getByTestId('stored-roast-date').textContent).toBe(
      expectedStored,
    )
    expect(screen.getByLabelText('Roast date').textContent).toContain(
      expectedMonth,
    )
    expect(screen.getByLabelText('Roast date').textContent).toContain(
      expectedYear,
    )

    await openPicker()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: SELECTED_DAY_NAME }))
    })

    expect(screen.getByTestId('stored-roast-date').textContent).toBe(
      expectedStored,
    )
    expect(screen.getByLabelText('Roast date').textContent).toContain(
      expectedMonth,
    )
    expect(screen.getByLabelText('Roast date').textContent).toContain(
      expectedYear,
    )
  })
})
