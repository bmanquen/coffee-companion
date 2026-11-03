import { apiErrorMessage } from './api-error'

const SEALED_MESSAGE =
  'This Brew is Sealed. Subscribe to read and edit it again.'
const FALLBACK = 'Something went wrong. Try again.'
const TRPC_FORBIDDEN = 'FORBIDDEN'

describe('apiErrorMessage', () => {
  it('uses the API message on a tRPC error', () => {
    const error = Object.assign(new Error(SEALED_MESSAGE), {
      data: { code: TRPC_FORBIDDEN },
    })
    expect(apiErrorMessage(error, FALLBACK)).toBe(SEALED_MESSAGE)
  })

  it('falls back for a transport failure', () => {
    expect(apiErrorMessage(new Error('Network request failed'), FALLBACK)).toBe(
      FALLBACK,
    )
  })

  it('falls back when the failure has no message', () => {
    expect(apiErrorMessage({}, FALLBACK)).toBe(FALLBACK)
  })
})
