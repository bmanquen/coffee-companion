import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EquipmentAddAction } from './equipment-add-action'
import type { ReactNode } from 'react'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}))

describe('EquipmentAddAction', () => {
  it('offers the add form when the Plan has room', () => {
    render(
      <EquipmentAddAction
        to="/equipment/grinders/new"
        label="Add Grinder"
        limitNote={null}
      />,
    )

    expect(
      screen.getByRole('link', { name: /add grinder/i }).getAttribute('href'),
    ).toBe('/equipment/grinders/new')
    expect(screen.queryByRole('link', { name: /plans/i })).toBe(null)
  })

  it('explains the limit and points at the plans once the Plan is full', () => {
    render(
      <EquipmentAddAction
        to="/equipment/grinders/new"
        label="Add Grinder"
        limitNote="Free holds 1 Grinder. Subscribe to add more."
      />,
    )

    expect(screen.getByText(/free holds 1 grinder/i)).toBeTruthy()
    expect(
      screen.getByRole('link', { name: /plans/i }).getAttribute('href'),
    ).toBe('/pricing')
    // No dead end: the form that would refuse them is not offered.
    expect(screen.queryByRole('link', { name: /add grinder/i })).toBe(null)
  })
})
