import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { CoffeeOriginFields } from './coffee-origin-fields'

function Harness({ initialBlend = false }: { initialBlend?: boolean }) {
  const [isBlend, setIsBlend] = useState(initialBlend)
  return (
    <CoffeeOriginFields isBlend={isBlend} onBlendChange={setIsBlend}>
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
  })

  it('hides origin fields when Blend is chosen', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('radio', { name: 'Blend' }))
    expect(screen.getByRole('radio', { name: 'Blend' })).toHaveProperty(
      'checked',
      true,
    )
    expect(screen.queryByText('Country field')).toBeNull()
  })

  it('restores origin fields when returning to single origin', () => {
    render(<Harness initialBlend />)
    expect(screen.queryByText('Country field')).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: 'Single origin' }))
    expect(screen.getByText('Country field')).toBeTruthy()
  })
})
