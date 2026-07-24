import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CoffeeDetails } from './coffee-details'

describe('CoffeeDetails', () => {
  it('renders process, roast level, varieties, the dialed-in recipe, and notes', () => {
    render(
      <CoffeeDetails
        process="Washed"
        roastLevel="Light"
        varieties={['Heirloom', 'Bourbon']}
        dialedInEspresso="18g → 38g · 27s · Grind 5"
        notes="jammy and bright"
      />,
    )
    expect(screen.getByText('Washed')).toBeTruthy()
    expect(screen.getByText('Light')).toBeTruthy()
    // Varieties are joined into a single line.
    expect(screen.getByText('Heirloom, Bourbon')).toBeTruthy()
    expect(screen.getByText('18g → 38g · 27s · Grind 5')).toBeTruthy()
    expect(screen.getByText('jammy and bright')).toBeTruthy()
  })

  it('shows a dash for missing fields and a dimmed placeholder for empty notes', () => {
    render(
      <CoffeeDetails
        process={null}
        roastLevel={null}
        varieties={[]}
        dialedInEspresso="-"
        notes={null}
      />,
    )
    // Process, Roast level, Varieties, and Dialed-in espresso all fall back to "-".
    expect(screen.getAllByText('-')).toHaveLength(4)
    // Empty notes show a dimmed "No notes..." placeholder, not a dash.
    expect(screen.getByText('No notes...')).toBeTruthy()
    const notesValue = screen.getByText('Notes').closest('div')
    expect(notesValue?.textContent).not.toContain('-')
  })
})
