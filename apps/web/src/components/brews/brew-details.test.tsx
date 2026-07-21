import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BrewDetails } from './brew-details'

const grinder = { name: 'Ode', brand: 'Fellow' }
const device = { name: 'V60', brand: 'Hario' }

describe('BrewDetails', () => {
  it('renders grinder, device, ratio, the extra slot, and notes', () => {
    render(
      <BrewDetails
        grinder={grinder}
        device={device}
        ratio="1:16.0"
        extra={{ label: 'Water temp', value: '94°C' }}
        notes="bright and clean"
      />,
    )
    expect(screen.getByText(/Ode \(Fellow\)/)).toBeTruthy()
    expect(screen.getByText(/V60 \(Hario\)/)).toBeTruthy()
    expect(screen.getByText('1:16.0')).toBeTruthy()
    expect(screen.getByText(/Water temp/)).toBeTruthy()
    expect(screen.getByText('94°C')).toBeTruthy()
    expect(screen.getByText('bright and clean')).toBeTruthy()
  })

  it('omits the extra slot when not given and renders empty notes blank', () => {
    render(
      <BrewDetails
        grinder={grinder}
        device={device}
        ratio="1:2.0"
        notes={null}
      />,
    )
    expect(screen.queryByText(/Water temp/)).toBeNull()
    expect(screen.queryByText(/Environment/)).toBeNull()
    // Empty notes render blank, not a dash.
    const notesValue = screen.getByText('Notes:').closest('div')
    expect(notesValue?.textContent).not.toContain('-')
  })
})
