import { describe, expect, it } from 'vitest'
import { formatOriginNames } from './format-coffee-origins'

describe('formatOriginNames', () => {
  it('joins country names in origin order', () => {
    expect(
      formatOriginNames(
        [
          { country: { name: 'Ethiopia' }, region: { name: 'Guji' } },
          { country: { name: 'Colombia' }, region: { name: 'Huila' } },
        ],
        'country',
      ),
    ).toBe('Ethiopia, Colombia')
  })

  it('joins region names and keeps a dash for a missing region', () => {
    expect(
      formatOriginNames(
        [
          { country: { name: 'Ethiopia' }, region: { name: 'Guji' } },
          { country: { name: 'Colombia' }, region: null },
        ],
        'region',
      ),
    ).toBe('Guji, -')
  })

  it('returns a dash when a coffee has no origins', () => {
    expect(formatOriginNames([], 'country')).toBe('-')
  })

  it('returns a single dash when every origin is missing that place', () => {
    expect(
      formatOriginNames(
        [
          { country: { name: 'Ethiopia' }, region: null },
          { country: { name: 'Colombia' }, region: null },
        ],
        'region',
      ),
    ).toBe('-')
  })
})
