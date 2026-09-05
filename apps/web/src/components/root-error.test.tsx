import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RootError } from './root-error'

const captureException = vi.fn()

vi.mock('@sentry/tanstackstart-react', () => ({
  captureException: (...args: Array<unknown>) => captureException(...args),
}))

describe('RootError', () => {
  it('shows a generic recovery page and reports the exception', () => {
    const error = new Error('boom')

    render(<RootError error={error} reset={() => {}} />)

    expect(
      screen.getByRole('heading', { name: 'Something went wrong' }),
    ).toBeTruthy()
    expect(captureException).toHaveBeenCalledWith(error)
  })
})
