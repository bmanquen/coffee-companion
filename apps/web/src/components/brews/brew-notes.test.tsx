import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BrewNotes } from './brew-notes'

describe('BrewNotes', () => {
  it('renders the notes text when present', () => {
    render(<BrewNotes notes="bright and clean" />)
    expect(screen.getByText('bright and clean')).toBeTruthy()
    expect(screen.queryByText('No notes...')).toBeNull()
  })

  it('renders a dimmed "No notes..." placeholder when empty', () => {
    render(<BrewNotes notes={null} />)
    expect(screen.getByText('No notes...')).toBeTruthy()
  })
})
