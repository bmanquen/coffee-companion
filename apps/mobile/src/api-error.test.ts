import { apiErrorMessage } from './api-error'

describe('apiErrorMessage', () => {
  it('uses the API message when one is present', () => {
    expect(
      apiErrorMessage(
        new Error('This Brew is Sealed. Subscribe to read and edit it again.'),
        'Something went wrong. Try again.',
      ),
    ).toBe('This Brew is Sealed. Subscribe to read and edit it again.')
  })

  it('falls back when the failure has no message', () => {
    expect(apiErrorMessage({}, 'Something went wrong. Try again.')).toBe(
      'Something went wrong. Try again.',
    )
  })
})
