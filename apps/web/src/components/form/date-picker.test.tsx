import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { useAppForm } from '@/hooks/form'

// Mock the Radix Popover + Calendar so the date-picker's own logic (display +
// onSelect + close) runs without browser-only APIs. Real calendar use is
// covered by e2e.
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
vi.mock('@/components/ui/calendar', () => ({
  Calendar: ({ onSelect }: { onSelect: (date?: Date) => void }) => (
    <>
      <button type="button" onClick={() => onSelect(new Date(2026, 0, 15))}>
        pick-jan-15
      </button>
      {/* react-day-picker single mode (without required) unselects on re-click. */}
      <button type="button" onClick={() => onSelect(undefined)}>
        reselect-current
      </button>
      <button
        type="button"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSelect(new Date(2026, 0, 20))
          }
        }}
      >
        focused-day
      </button>
      <button type="button">go-to-next-month</button>
    </>
  ),
}))

function Harness({
  value,
  showLabel,
}: {
  value?: string | null
  showLabel?: boolean
}) {
  const form = useAppForm({
    defaultValues: { roastDate: value ?? null },
  })
  return (
    <form.AppField name="roastDate">
      {(field) => (
        <>
          <field.DatePicker label="Roast date" showLabel={showLabel} />
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

describe('DatePicker', () => {
  it('is running in a zone where UTC conversion would shift the day', () => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    expect(['America/Chicago', 'Asia/Tokyo']).toContain(tz)
    if (tz === 'America/Chicago') {
      expect(new Date('2026-05-01').getDate()).toBe(30)
    }
    if (tz === 'Asia/Tokyo') {
      expect(new Date(2026, 4, 1).toISOString().slice(0, 10)).toBe('2026-04-30')
    }
  })

  it('shows the placeholder when no date is selected', () => {
    render(<Harness />)
    expect(screen.getByText('Pick a date')).toBeTruthy()
  })

  it('shows the saved calendar day for a YYYY-MM-DD string', () => {
    render(<Harness value="2026-05-01" />)
    expect(screen.getByText('May 1st, 2026')).toBeTruthy()
    expect(screen.queryByText('April 30th, 2026')).toBeNull()
    expect(screen.getByTestId('stored-roast-date').textContent).toBe(
      '"2026-05-01"',
    )
  })

  it('shows the formatted date when one is selected', () => {
    render(<Harness value="2026-01-15" />)
    expect(screen.getByText('January 15th, 2026')).toBeTruthy()
  })

  it('stores a picked day as YYYY-MM-DD, not a Date, and closes', async () => {
    render(<Harness />)
    expect(screen.getByText('Pick a date')).toBeTruthy()
    await openPicker()
    await act(async () => {
      fireEvent.click(screen.getByText('pick-jan-15'))
    })
    expect(screen.getByText('January 15th, 2026')).toBeTruthy()
    expect(screen.getByTestId('stored-roast-date').textContent).toBe(
      '"2026-01-15"',
    )
    expect(screen.queryByText('pick-jan-15')).toBeNull()
  })

  it('closes when a focused day is selected with the keyboard', async () => {
    render(<Harness />)
    await openPicker()
    await act(async () => {
      fireEvent.keyDown(screen.getByText('focused-day'), { key: 'Enter' })
    })
    expect(screen.getByText('January 20th, 2026')).toBeTruthy()
    expect(screen.getByTestId('stored-roast-date').textContent).toBe(
      '"2026-01-20"',
    )
    expect(screen.queryByText('focused-day')).toBeNull()
  })

  it('stays open when the month is changed', async () => {
    render(<Harness />)
    await openPicker()
    await act(async () => {
      fireEvent.click(screen.getByText('go-to-next-month'))
    })
    expect(screen.getByText('pick-jan-15')).toBeTruthy()
    expect(screen.getByText('Pick a date')).toBeTruthy()
    expect(screen.getByTestId('stored-roast-date').textContent).toBe('null')
  })

  it('stays open when arrow keys move between days', async () => {
    render(<Harness />)
    await openPicker()
    await act(async () => {
      fireEvent.keyDown(screen.getByText('focused-day'), { key: 'ArrowRight' })
    })
    expect(screen.getByText('focused-day')).toBeTruthy()
    expect(screen.getByText('Pick a date')).toBeTruthy()
  })

  it('keeps the value and closes when the current day is re-selected', async () => {
    render(<Harness value="2026-01-15" />)

    await openPicker()
    await act(async () => {
      fireEvent.click(screen.getByText('reselect-current'))
    })

    expect(screen.getByText('January 15th, 2026')).toBeTruthy()
    expect(screen.getByTestId('stored-roast-date').textContent).toBe(
      '"2026-01-15"',
    )
    expect(screen.queryByText('reselect-current')).toBeNull()
  })

  it('associates the label with the trigger', () => {
    render(<Harness />)
    expect(screen.getByLabelText('Roast date')).toBeTruthy()
  })

  it('keeps the label reachable when it is visually hidden', () => {
    render(<Harness showLabel={false} />)

    expect(
      screen.getByText('Roast date').closest('[data-slot="field-label"]')
        ?.className,
    ).toContain('sr-only')
  })
})
