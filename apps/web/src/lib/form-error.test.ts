import { describe, expect, it, vi } from 'vitest'
import {
  applyMutationError,
  formLevelMessage,
  mapMutationError,
  rememberSubmittedValues,
  submitFormMutation,
  submittedValuesKey,
} from './form-error'

const trpcError = (code: string, message: string) =>
  Object.assign(new Error(message), { data: { code } })

describe('mapMutationError', () => {
  it('maps a CONFLICT onto the named field', () => {
    expect(
      mapMutationError(
        trpcError(
          'CONFLICT',
          'A coffee with this name already exists for this roaster',
        ),
        { CONFLICT: 'name' },
      ),
    ).toEqual({
      kind: 'field',
      name: 'name',
      message: 'A coffee with this name already exists for this roaster',
    })
  })

  it('keeps a Plan limit as a plan-limit, not a field', () => {
    expect(
      mapMutationError(
        trpcError('FORBIDDEN', 'Free holds 1 grinder. Subscribe to add more.'),
        { FORBIDDEN: 'name' },
      ),
    ).toEqual({
      kind: 'plan-limit',
      message: 'Free holds 1 grinder. Subscribe to add more.',
    })
  })

  it('sends an unmapped server error to the form banner', () => {
    expect(mapMutationError(trpcError('NOT_FOUND', 'Coffee not found'))).toEqual(
      {
        kind: 'form',
        message: 'Coffee not found',
      },
    )
  })

  it('returns null when there is no error', () => {
    expect(mapMutationError(null)).toBe(null)
  })
})

describe('formLevelMessage', () => {
  it('returns only unmapped form errors', () => {
    expect(
      formLevelMessage(
        trpcError('CONFLICT', 'A coffee with this name already exists'),
        { CONFLICT: 'name' },
      ),
    ).toBe(null)
    expect(formLevelMessage(trpcError('NOT_FOUND', 'Coffee not found'))).toBe(
      'Coffee not found',
    )
  })
})

describe('applyMutationError', () => {
  it('writes a CONFLICT onto the mapped field via onServer', () => {
    const setErrorMap = vi.fn()
    applyMutationError(
      { setErrorMap },
      trpcError(
        'CONFLICT',
        'A coffee with this name already exists for this roaster',
      ),
      { CONFLICT: 'name' },
    )
    expect(setErrorMap).toHaveBeenCalledWith({
      onServer: {
        fields: {
          name: 'A coffee with this name already exists for this roaster',
        },
      },
    })
  })

  it('does not write a Plan limit onto the form', () => {
    const setErrorMap = vi.fn()
    applyMutationError(
      { setErrorMap },
      trpcError('FORBIDDEN', 'Free holds 1 grinder. Subscribe to add more.'),
    )
    expect(setErrorMap).not.toHaveBeenCalled()
  })
})

describe('rememberSubmittedValues', () => {
  it('records the values object that submit sent', () => {
    const form = {}
    rememberSubmittedValues(form, { name: 'Ethiopia' })
    expect(submittedValuesKey(form)).toBe(JSON.stringify({ name: 'Ethiopia' }))
  })

  it('submitFormMutation records the form store, not the API payload', async () => {
    const form = {
      setErrorMap: vi.fn(),
      store: { state: { values: { name: 'Ethiopia', origins: [{ countryId: '' }] } } },
    }
    await submitFormMutation(form, async () => {}, { name: 'Ethiopia', origins: [] })
    expect(submittedValuesKey(form)).toBe(
      JSON.stringify({ name: 'Ethiopia', origins: [{ countryId: '' }] }),
    )
  })
})
