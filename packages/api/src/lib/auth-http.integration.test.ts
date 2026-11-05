import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db'
import { handleAuthGet } from './auth-http'
import {
  E2E_AUTH_COOKIE_NAME,
  E2E_AUTH_HEADER,
  E2E_USER_WITH_DATA,
} from './e2e-auth'
import { setLogSink } from './log'

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
    setLogSink(null)
    if (original === undefined) delete process.env.E2E_BYPASS_AUTH
    else process.env.E2E_BYPASS_AUTH = original
  })

  it('logs whether x-e2e-auth was present on get-session', async () => {
    process.env.E2E_BYPASS_AUTH = 'true'
    const sink = vi.fn()
    setLogSink(sink)
    await handleAuthGet(
      new Request(`${baseURL}/api/auth/get-session`, {
        method: 'GET',
        headers: {
          'expo-origin': MOBILE_EXPO_ORIGIN,
          [E2E_AUTH_HEADER]: E2E_USER_WITH_DATA,
        },
      }),
    )
    expect(sink).toHaveBeenCalledWith(
      'info',
      'e2e get-session',
      expect.objectContaining({
        e2eAuth: true,
        sessionUser: E2E_USER_WITH_DATA,
      }),
    )
  })

  it('does not log get-session diagnostics outside development and test', async () => {
    const originalNodeEnv = process.env.NODE_ENV
    process.env.E2E_BYPASS_AUTH = 'true'
    process.env.NODE_ENV = 'staging'
    const sink = vi.fn()
    setLogSink(sink)
    try {
      await handleAuthGet(
        new Request(`${baseURL}/api/auth/get-session`, {
          method: 'GET',
          headers: {
            'expo-origin': MOBILE_EXPO_ORIGIN,
            [E2E_AUTH_HEADER]: E2E_USER_WITH_DATA,
          },
        }),
      )
      expect(sink).not.toHaveBeenCalled()
    } finally {
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = originalNodeEnv
    }
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

  it('yields a session for the mobile client fetch after Cookie is stripped', async () => {
    process.env.E2E_BYPASS_AUTH = 'true'
    const headers = new Headers({
      'expo-origin': MOBILE_EXPO_ORIGIN,
      'x-skip-oauth-proxy': 'true',
      [E2E_AUTH_HEADER]: E2E_USER_WITH_DATA,
    })
    const response = await handleAuthGet(
      new Request(`${baseURL}/api/auth/get-session`, {
        method: 'GET',
        headers,
      }),
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as { user?: { id?: string } }
    expect(body.user?.id).toBe(E2E_USER_WITH_DATA)
    expect(headers.has('cookie')).toBe(false)
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
