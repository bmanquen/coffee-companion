import { describe, expect, it } from 'vitest'
import {
  ESPRESSO_DEVICE_TYPE,
  decodeEspressoShotCursor,
  encodeEspressoShotCursor,
  isEspressoDevice,
  normalizeDecimal,
} from './espresso'

describe('isEspressoDevice', () => {
  it('is true only for the espresso device type', () => {
    expect(isEspressoDevice({ type: { name: ESPRESSO_DEVICE_TYPE } })).toBe(true)
    expect(isEspressoDevice({ type: { name: 'Pour Over' } })).toBe(false)
  })
})

describe('normalizeDecimal', () => {
  it('treats trailing zeros as the same number', () => {
    expect(normalizeDecimal('16')).toBe('16')
    expect(normalizeDecimal('16.0')).toBe('16')
    expect(normalizeDecimal('16.00')).toBe('16')
    expect(normalizeDecimal('16.10')).toBe('16.1')
    expect(normalizeDecimal('016')).toBe('16')
  })

  it('keeps null and blank values as null', () => {
    expect(normalizeDecimal(null)).toBeNull()
    expect(normalizeDecimal(undefined)).toBeNull()
    expect(normalizeDecimal('')).toBeNull()
    expect(normalizeDecimal('  ')).toBeNull()
  })
})

describe('espresso shot cursor', () => {
  const key = {
    createdAt: '2026-05-01 12:00:00.123456',
    id: '00000000-0000-4000-8000-000000000001',
  }

  it('round-trips a microsecond timestamp', () => {
    expect(decodeEspressoShotCursor(encodeEspressoShotCursor(key))).toEqual(key)
  })

  it('rejects a millisecond ISO stamp and a malformed token', () => {
    expect(decodeEspressoShotCursor('not-a-cursor')).toBeNull()
    expect(decodeEspressoShotCursor('')).toBeNull()
    expect(
      decodeEspressoShotCursor(
        Buffer.from(`2026-05-01T12:00:00.123Z\0${key.id}`, 'utf8').toString(
          'base64url',
        ),
      ),
    ).toBeNull()
    expect(
      decodeEspressoShotCursor(
        Buffer.from('2026-05-01 12:00:00.123456\0not-a-uuid', 'utf8').toString(
          'base64url',
        ),
      ),
    ).toBeNull()
  })
})
