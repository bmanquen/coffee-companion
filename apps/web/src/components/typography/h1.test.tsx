import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { H1 } from './h1'

describe('H1', () => {
  it('renders a level-1 heading with its children', () => {
    render(<H1>Dashboard</H1>)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Dashboard' }),
    ).toBeTruthy()
  })
})
