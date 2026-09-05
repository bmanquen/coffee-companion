import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Input } from './input'

// Placeholder weight lives on this shared input so duration boxes, notes,
// and search fields all mute the same way — not a per-field class.
describe('Input', () => {
  it('mutes placeholder text so hint copy does not compete with a filled value', () => {
    render(<Input placeholder="hint" aria-label="Example" />)

    expect(screen.getByLabelText('Example').className).toContain(
      'placeholder:text-muted-foreground/40',
    )
  })
})
