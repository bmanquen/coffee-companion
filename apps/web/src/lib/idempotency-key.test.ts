import { describe, expect, it, vi } from 'vitest'
import { createIdempotencyKey } from './idempotency-key'

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('createIdempotencyKey', () => {
  it('builds a version-4 UUID from getRandomValues', () => {
    const zeros = new Uint8Array(16)
    vi.spyOn(crypto, 'getRandomValues').mockImplementation((buffer) => {
      const target = buffer as Uint8Array
      target.set(zeros)
      return target
    })
    expect(createIdempotencyKey()).toBe(
      '00000000-0000-4000-8000-000000000000',
    )
  })

  it('matches the version-4 UUID format', () => {
    expect(createIdempotencyKey()).toMatch(UUID_V4_PATTERN)
  })
})
