import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Input } from './input'

// Placeholder weight lives on this shared input so Dose, Water, duration
// boxes, and search fields all mute the same way — not a per-field class.
describe('Input', () => {
  it('mutes placeholder text so hint copy does not compete with a filled value', () => {
    render(<Input placeholder="grams" aria-label="Dose (g)" />)

    expect(screen.getByLabelText('Dose (g)').className).toContain(
      'placeholder:text-muted-foreground/40',
    )
  })
})
