import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { useAppForm } from '@/hooks/form'

// Mock the Radix Popover + Calendar so the date-picker's own logic (display +
// onSelect) runs without browser-only APIs. Real calendar use is covered by e2e.
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  PopoverContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}))
vi.mock('@/components/ui/calendar', () => ({
  Calendar: ({ onSelect }: { onSelect: (date?: Date) => void }) => (
    <>
      <button
        type="button"
        onClick={() => onSelect(new Date(2026, 0, 15))}
      >
        pick-jan-15
      </button>
      {/* Radix hands back undefined when a selection is cleared. */}
      <button type="button" onClick={() => onSelect(undefined)}>
        pick-nothing
      </button>
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

describe('DatePicker', () => {
  it('runs behind UTC so a YYYY-MM-DD Date parse would roll back a day', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(
      'America/Chicago',
    )
    expect(new Date('2026-05-01').getDate()).toBe(30)
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

  it('stores a picked day as YYYY-MM-DD, not a Date', async () => {
    render(<Harness />)
    expect(screen.getByText('Pick a date')).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByText('pick-jan-15'))
    })
    expect(screen.getByText('January 15th, 2026')).toBeTruthy()
    expect(screen.getByTestId('stored-roast-date').textContent).toBe(
      '"2026-01-15"',
    )
  })

  it('ignores a cleared selection rather than storing undefined', async () => {
    render(<Harness value="2026-01-15" />)

    await act(async () => {
      fireEvent.click(screen.getByText('pick-nothing'))
    })

    expect(screen.getByText('January 15th, 2026')).toBeTruthy()
    expect(screen.getByTestId('stored-roast-date').textContent).toBe(
      '"2026-01-15"',
    )
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
