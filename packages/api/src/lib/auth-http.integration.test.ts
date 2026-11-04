import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { db } from '../db'
import { handleAuthGet } from './auth-http'
import {
  E2E_AUTH_COOKIE_NAME,
  E2E_AUTH_HEADER,
  E2E_USER_WITH_DATA,
} from './e2e-auth'

const baseURL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'

// expoClient's fetch plugin on native: credentials omit, Cookie from the
// SecureStore JSON map (RN fetch may drop it), expo-origin from
// Linking.createURL, x-skip-oauth-proxy always.
const MOBILE_EXPO_ORIGIN = 'coffeecompanion:///127.0.0.1:8081'

afterAll(async () => {
  await db.$client.end()
})

describe('GET /api/auth/get-session', () => {
  const original = process.env.E2E_BYPASS_AUTH

  afterEach(() => {
    if (original === undefined) delete process.env.E2E_BYPASS_AUTH
    else process.env.E2E_BYPASS_AUTH = original
  })

  it('yields a session from the native E2E request when Cookie is stripped', async () => {
    process.env.E2E_BYPASS_AUTH = 'true'
    const response = await handleAuthGet(
      new Request(`${baseURL}/api/auth/get-session`, {
        method: 'GET',
        headers: {
          'expo-origin': MOBILE_EXPO_ORIGIN,
          'x-skip-oauth-proxy': 'true',
          [E2E_AUTH_HEADER]: E2E_USER_WITH_DATA,
        },
      }),
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      user?: { id?: string }
      session?: { userId?: string }
    }
    expect(body.user?.id).toBe(E2E_USER_WITH_DATA)
    expect(body.session?.userId).toBe(E2E_USER_WITH_DATA)
  })

  it('still yields a session from the expoClient Cookie map', async () => {
    process.env.E2E_BYPASS_AUTH = 'true'
    const response = await handleAuthGet(
      new Request(`${baseURL}/api/auth/get-session`, {
        method: 'GET',
        headers: {
          cookie: `${E2E_AUTH_COOKIE_NAME}=${E2E_USER_WITH_DATA}`,
          'expo-origin': MOBILE_EXPO_ORIGIN,
          'x-skip-oauth-proxy': 'true',
        },
      }),
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as { user?: { id?: string } }
    expect(body.user?.id).toBe(E2E_USER_WITH_DATA)
  })
})
