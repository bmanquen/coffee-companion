import { describe, expect, it } from 'vitest'
import {
  APP_SCHEME_ORIGIN,
  EXPO_DEV_ORIGIN,
  trustedAuthOrigins,
} from './auth-origins'

const BASE_URL = 'https://coffee.example'

describe('trustedAuthOrigins', () => {
  it('trusts the Expo bundler only outside production', () => {
    expect(trustedAuthOrigins(BASE_URL, 'development')).toEqual([
      BASE_URL,
      APP_SCHEME_ORIGIN,
      EXPO_DEV_ORIGIN,
    ])
    expect(trustedAuthOrigins(BASE_URL, 'test')).toEqual([
      BASE_URL,
      APP_SCHEME_ORIGIN,
      EXPO_DEV_ORIGIN,
    ])
    expect(trustedAuthOrigins(BASE_URL, undefined)).toEqual([
      BASE_URL,
      APP_SCHEME_ORIGIN,
      EXPO_DEV_ORIGIN,
    ])
    expect(trustedAuthOrigins(BASE_URL, 'production')).toEqual([
      BASE_URL,
      APP_SCHEME_ORIGIN,
    ])
  })
})
