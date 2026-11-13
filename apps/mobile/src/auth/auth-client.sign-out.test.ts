jest.mock('better-auth/cookies', () => ({
  SECURE_COOKIE_PREFIX: '__Secure-',
  parseSetCookieHeader: () => new Map(),
  stripSecureCookiePrefix: (name: string) =>
    name.replace(/^__Secure-/i, ''),
}))
jest.mock('expo-linking', () => ({
  createURL: () => 'coffeecompanion://',
}))
jest.unmock('@better-auth/expo/client')
jest.mock('@better-auth/expo/client', () =>
  jest.requireActual('@better-auth/expo/client'),
)

const SESSION_TOKEN = 'session-token-abc'
const SESSION_COOKIE_JSON = JSON.stringify({
  'better-auth.session_token': { value: SESSION_TOKEN, expires: null },
})

describe('authClient sign-out', () => {
  const memory = new Map<string, string>()
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('keeps the session cookie after a failed sign-out so a retry can revoke', async () => {
    const cookieHeaders: Array<string | null> = []
    globalThis.fetch = jest.fn((input, init) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url
      const headers = new Headers(
        init?.headers ??
          (input instanceof Request ? input.headers : undefined),
      )
      if (url.includes('/sign-out')) {
        cookieHeaders.push(headers.get('cookie'))
        return Promise.reject(new Error('network'))
      }
      return Promise.resolve(
        new Response('null', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
    }) as typeof fetch

    jest.resetModules()
    const RN = require('react-native') as {
      AppState: {
        addEventListener: (
          type: string,
          listener: () => void,
        ) => { remove: () => void }
      }
    }
    RN.AppState.addEventListener = jest.fn(() => ({ remove: jest.fn() }))
    const SecureStore = require('expo-secure-store') as {
      getItem: jest.Mock
      setItem: jest.Mock
    }
    const { SESSION_COOKIE_KEY } = require('./session-store') as typeof import('./session-store')
    memory.clear()
    SecureStore.getItem.mockImplementation(
      (key: string) => memory.get(key) ?? null,
    )
    SecureStore.setItem.mockImplementation((key: string, value: string) => {
      memory.set(key, value)
    })
    memory.set(SESSION_COOKIE_KEY, SESSION_COOKIE_JSON)

    const { authClient, getSessionCookie } =
      require('./auth-client') as typeof import('./auth-client')

    const outcome = await authClient.signOut().then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    )
    expect('error' in outcome || outcome.value?.error).toBeTruthy()
    expect(memory.get(SESSION_COOKIE_KEY)).toBe(SESSION_COOKIE_JSON)
    expect(getSessionCookie()).toContain(SESSION_TOKEN)
    expect(cookieHeaders[0]).toContain(SESSION_TOKEN)

    await authClient.signOut().then(
      () => {},
      () => {},
    )
    expect(cookieHeaders[1]).toContain(SESSION_TOKEN)
  })
})
