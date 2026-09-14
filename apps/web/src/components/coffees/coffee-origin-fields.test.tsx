import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { CoffeeOriginFields } from './coffee-origin-fields'

function Harness({ initialBlend = false }: { initialBlend?: boolean }) {
  const [isBlend, setIsBlend] = useState(initialBlend)
  return (
    <CoffeeOriginFields
      isBlend={isBlend}
      onBlendChange={setIsBlend}
      onAddOrigin={() => undefined}
    >
      <span>Country field</span>
    </CoffeeOriginFields>
  )
}

describe('CoffeeOriginFields', () => {
  it('defaults to single origin and shows origin fields', () => {
    render(<Harness />)
    expect(screen.getByRole('radio', { name: 'Single origin' })).toHaveProperty(
      'checked',
      true,
    )
    expect(screen.getByText('Country field')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Add country' })).toBeNull()
  })

  it('keeps origin fields visible when Blend is chosen', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('radio', { name: 'Blend' }))
    expect(screen.getByRole('radio', { name: 'Blend' })).toHaveProperty(
      'checked',
      true,
    )
    expect(screen.getByText('Country field')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add country' })).toBeTruthy()
  })

  it('hides Add country when returning to single origin', () => {
    render(<Harness initialBlend />)
    expect(screen.getByRole('button', { name: 'Add country' })).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: 'Single origin' }))
    expect(screen.getByText('Country field')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Add country' })).toBeNull()
  })
})
