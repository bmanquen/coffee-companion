import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DialedInToggleCell } from './dialed-in-toggle-cell'

describe('DialedInToggleCell', () => {
  it('shows the "clear" label and pressed state when dialed in', () => {
    render(
      <DialedInToggleCell
        dialedIn
        onToggle={() => {}}
        onLabel="Dialed in — clear"
        offLabel="Mark as dialed in"
      />,
    )
    const button = screen.getByRole('button', { name: 'Dialed in — clear' })
    expect(button.getAttribute('aria-pressed')).toBe('true')
  })

  it('shows the "mark" label and unpressed state when not dialed in', () => {
    render(
      <DialedInToggleCell
        dialedIn={false}
        onToggle={() => {}}
        onLabel="Dialed in — clear"
        offLabel="Mark as dialed in"
      />,
    )
    const button = screen.getByRole('button', { name: 'Mark as dialed in' })
    expect(button.getAttribute('aria-pressed')).toBe('false')
  })

  it('fires onToggle when clicked', () => {
    const onToggle = vi.fn()
    render(
      <DialedInToggleCell
        dialedIn={false}
        onToggle={onToggle}
        onLabel="Dialed in — clear"
        offLabel="Mark as dialed in"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Mark as dialed in' }))
    expect(onToggle).toHaveBeenCalledOnce()
  })
})
