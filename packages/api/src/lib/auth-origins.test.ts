import { describe, expect, it } from 'vitest'
import {
  APP_SCHEME_ORIGIN,
  EXPO_DEV_CLIENT_ORIGIN,
  EXPO_DEV_ORIGIN,
  trustedAuthOrigins,
} from './auth-origins'

const BASE_URL = 'https://coffee.example'

describe('trustedAuthOrigins', () => {
  it('trusts the Expo bundler only in development and test', () => {
    expect(trustedAuthOrigins(BASE_URL, { NODE_ENV: 'development' })).toEqual([
      BASE_URL,
      APP_SCHEME_ORIGIN,
      EXPO_DEV_ORIGIN,
      EXPO_DEV_CLIENT_ORIGIN,
    ])
    expect(trustedAuthOrigins(BASE_URL, { NODE_ENV: 'test' })).toEqual([
      BASE_URL,
      APP_SCHEME_ORIGIN,
      EXPO_DEV_ORIGIN,
      EXPO_DEV_CLIENT_ORIGIN,
    ])
    for (const nodeEnv of [undefined, 'production', 'staging'] as const) {
      expect(trustedAuthOrigins(BASE_URL, { NODE_ENV: nodeEnv })).toEqual([
        BASE_URL,
        APP_SCHEME_ORIGIN,
      ])
    }
  })

  it('trusts the Android emulator host for a loopback BETTER_AUTH_URL', () => {
    expect(
      trustedAuthOrigins('http://127.0.0.1:3910', { NODE_ENV: 'development' }),
    ).toEqual([
      'http://127.0.0.1:3910',
      APP_SCHEME_ORIGIN,
      EXPO_DEV_ORIGIN,
      EXPO_DEV_CLIENT_ORIGIN,
      'http://localhost:3910',
      'http://10.0.2.2:3910',
    ])
    expect(
      trustedAuthOrigins('http://127.0.0.1:3910', { NODE_ENV: 'test' }),
    ).toEqual([
      'http://127.0.0.1:3910',
      APP_SCHEME_ORIGIN,
      EXPO_DEV_ORIGIN,
      EXPO_DEV_CLIENT_ORIGIN,
      'http://localhost:3910',
      'http://10.0.2.2:3910',
    ])
    for (const nodeEnv of [undefined, 'production', 'staging'] as const) {
      expect(
        trustedAuthOrigins('http://127.0.0.1:3910', { NODE_ENV: nodeEnv }),
      ).toEqual(['http://127.0.0.1:3910', APP_SCHEME_ORIGIN])
    }
  })
})
