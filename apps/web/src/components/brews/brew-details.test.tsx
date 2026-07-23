import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BrewDetails } from './brew-details'

const grinder = { name: 'Ode', brand: 'Fellow' }
const device = { name: 'V60', brand: 'Hario' }

describe('BrewDetails', () => {
  it('renders grinder, device, the extra slot, and notes', () => {
    render(
      <BrewDetails
        grinder={grinder}
        device={device}
        extra={{ label: 'Water temp', value: '94°C' }}
        notes="bright and clean"
      />,
    )
    expect(screen.getByText(/Ode \(Fellow\)/)).toBeTruthy()
    expect(screen.getByText(/V60 \(Hario\)/)).toBeTruthy()
    expect(screen.getByText(/Water temp/)).toBeTruthy()
    expect(screen.getByText('94°C')).toBeTruthy()
    expect(screen.getByText('bright and clean')).toBeTruthy()
  })

  it('omits the extra slot and shows a dimmed placeholder for empty notes', () => {
    render(<BrewDetails grinder={grinder} device={device} notes={null} />)
    expect(screen.queryByText(/Water temp/)).toBeNull()
    expect(screen.queryByText(/Environment/)).toBeNull()
    // Empty notes show a dimmed "No notes..." placeholder, not a dash.
    expect(screen.getByText('No notes...')).toBeTruthy()
    const notesValue = screen.getByText('Notes').closest('div')
    expect(notesValue?.textContent).not.toContain('-')
  })
})
