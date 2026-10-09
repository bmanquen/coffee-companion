import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { db } from '../db'
import { auth } from './auth'

const baseURL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'

const vars = [
  'APPLE_BUNDLE_ID',
  'APPLE_TEAM_ID',
  'APPLE_KEY_ID',
  'APPLE_PRIVATE_KEY',
] as const

const saved = Object.fromEntries(
  vars.map((name) => [name, process.env[name]]),
)

afterEach(() => {
  for (const name of vars) {
    if (saved[name] === undefined) delete process.env[name]
    else process.env[name] = saved[name]
  }
})

afterAll(async () => {
  await db.$client.end()
})

function post(body: unknown) {
  return auth.handler(
    new Request(`${baseURL}/api/auth/sign-in/apple-native`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'coffeecompanion://',
      },
      body: JSON.stringify(body),
    }),
  )
}

describe('POST /api/auth/sign-in/apple-native', () => {
  it('is unavailable when Apple Sign In is not configured', async () => {
    for (const name of vars) delete process.env[name]
    const response = await post({
      identityToken: 'not-a-jwt',
      authorizationCode: 'code',
    })
    expect(response.status).toBe(503)
  })

  it('refuses a token the server cannot verify', async () => {
    process.env.APPLE_BUNDLE_ID = 'dev.offbyonelabs.coffeecompanion'
    process.env.APPLE_TEAM_ID = 'TEAM123456'
    process.env.APPLE_KEY_ID = 'KEYID1234'
    process.env.APPLE_PRIVATE_KEY =
      '-----BEGIN PRIVATE KEY-----\nM\n-----END PRIVATE KEY-----'

    const response = await post({
      identityToken: 'not-a-jwt',
      authorizationCode: 'code',
    })
    expect(response.status).toBe(401)
  })
})
