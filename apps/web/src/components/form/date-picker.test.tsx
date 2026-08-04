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
        onClick={() => onSelect(new Date('2026-01-15T00:00:00'))}
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
  value?: Date
  showLabel?: boolean
}) {
  const form = useAppForm({
    defaultValues: { roastDate: value },
  })
  return (
    <form.AppField name="roastDate">
      {(field) => <field.DatePicker label="Roast date" showLabel={showLabel} />}
    </form.AppField>
  )
}

describe('DatePicker', () => {
  it('shows the placeholder when no date is selected', () => {
    render(<Harness />)
    expect(screen.getByText('Pick a date')).toBeTruthy()
  })

  it('shows the formatted date when one is selected', () => {
    render(<Harness value={new Date('2026-01-15T00:00:00')} />)
    expect(screen.getByText('January 15th, 2026')).toBeTruthy()
  })

  it('updates the field when a date is picked', async () => {
    render(<Harness />)
    expect(screen.getByText('Pick a date')).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByText('pick-jan-15'))
    })
    expect(screen.getByText('January 15th, 2026')).toBeTruthy()
  })

  it('ignores a cleared selection rather than storing undefined', async () => {
    render(<Harness value={new Date('2026-01-15T00:00:00')} />)

    await act(async () => {
      fireEvent.click(screen.getByText('pick-nothing'))
    })

    expect(screen.getByText('January 15th, 2026')).toBeTruthy()
  })

  it('keeps the label reachable when it is visually hidden', () => {
    render(<Harness showLabel={false} />)

    expect(screen.getByText('Roast date').className).toContain('sr-only')
  })
})
