import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FormLabel } from './form-label'

describe('FormLabel', () => {
  it('renders the label text without a star when the field is optional', () => {
    render(<FormLabel htmlFor="notes">Notes</FormLabel>)

    expect(screen.getByText('Notes')).toBeTruthy()
    expect(screen.queryByText('*')).toBeNull()
  })

  it('appends a visible, aria-hidden star when the field is required', () => {
    render(
      <FormLabel htmlFor="name" required>
        Name
      </FormLabel>,
    )

    const star = screen.getByText('*')
    expect(star).toBeTruthy()
    expect(star.getAttribute('aria-hidden')).toBe('true')
    expect(star.parentElement?.textContent).toBe('Name *')
  })
})
