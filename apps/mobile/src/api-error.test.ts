import { apiErrorMessage } from './api-error'

const SEALED_MESSAGE =
  'This Brew is Sealed. Subscribe to read and edit it again.'
const FALLBACK = 'Something went wrong. Try again.'
const TRPC_FORBIDDEN = 'FORBIDDEN'
const TRPC_NOT_FOUND = 'NOT_FOUND'
const TRPC_BAD_REQUEST = 'BAD_REQUEST'
const TRPC_INTERNAL = 'INTERNAL_SERVER_ERROR'

function trpcError(code: string, message: string) {
  return Object.assign(new Error(message), { data: { code } })
}

describe('apiErrorMessage', () => {
  it('uses the API message on a tRPC error', () => {
    expect(
      apiErrorMessage(trpcError(TRPC_FORBIDDEN, SEALED_MESSAGE), FALLBACK),
    ).toBe(SEALED_MESSAGE)
  })

  it('uses the API message for a missing device or shot', () => {
    expect(
      apiErrorMessage(trpcError(TRPC_NOT_FOUND, 'Shot not found'), FALLBACK),
    ).toBe('Shot not found')
  })

  it('uses the API message when the device is not espresso', () => {
    expect(
      apiErrorMessage(
        trpcError(
          TRPC_BAD_REQUEST,
          'Espresso shots require an Espresso brewing device',
        ),
        FALLBACK,
      ),
    ).toBe('Espresso shots require an Espresso brewing device')
  })

  it('falls back for a non-allowlisted tRPC code', () => {
    expect(
      apiErrorMessage(
        trpcError(TRPC_INTERNAL, '{"issues":[{"code":"invalid_date"}]}'),
        FALLBACK,
      ),
    ).toBe(FALLBACK)
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
