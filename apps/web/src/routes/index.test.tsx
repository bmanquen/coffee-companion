import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LandingPage } from './index'

// The public root. Signed-in visitors never reach this component — the route's
// beforeLoad redirects them to the dashboard — so there is nothing session-
// dependent left to cover here.
describe('LandingPage', () => {
  it('offers Google sign-in', () => {
    render(<LandingPage />)
    expect(
      screen.getByRole('button', { name: /Sign in with Google/i }),
    ).toBeTruthy()
  })
})
