import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CoffeeOriginFields } from './coffee-origin-fields'

describe('CoffeeOriginFields', () => {
  it('shows origin rows and Add country', () => {
    render(
      <CoffeeOriginFields onAddOrigin={() => undefined}>
        <span>Country field</span>
      </CoffeeOriginFields>,
    )
    expect(screen.getByText('Country field')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add country' })).toBeTruthy()
  })
})
