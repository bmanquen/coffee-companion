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

type SignOutAuth = {
  authClient: { signOut: () => Promise<unknown> }
  getSessionCookie: () => string
  sessionAtom: () => { listen: (listener: () => void) => () => void }
}

function loadAuthWithSignOutFetch(
  memory: Map<string, string>,
  signOutFetch: (headers: Headers) => Promise<Response>,
) {
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
      return signOutFetch(headers)
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
    AppState: { addEventListener: (...args: Array<unknown>) => unknown }
  }
  RN.AppState.addEventListener = jest.fn(() => ({ remove: jest.fn() }))
  const SecureStore = require('expo-secure-store') as {
    getItem: jest.Mock
    setItem: jest.Mock
  }
  const sessionStore = require('./session-store') as {
    SESSION_COOKIE_KEY: string
  }
  memory.clear()
  SecureStore.getItem.mockImplementation(
    (key: string) => memory.get(key) ?? null,
  )
  SecureStore.setItem.mockImplementation((key: string, value: string) => {
    memory.set(key, value)
  })
  memory.set(sessionStore.SESSION_COOKIE_KEY, SESSION_COOKIE_JSON)

  const auth = require('./auth-client') as SignOutAuth
  auth.sessionAtom().listen(() => {})
  return { auth, cookieHeaders, SESSION_COOKIE_KEY: sessionStore.SESSION_COOKIE_KEY }
}

async function signOutIgnoringFailure(auth: SignOutAuth) {
  try {
    await auth.authClient.signOut()
  } catch {
    return
  }
}

describe('authClient sign-out', () => {
  const memory = new Map<string, string>()
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('keeps the session cookie after a failed sign-out so a retry can revoke', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {})
    const { auth, cookieHeaders, SESSION_COOKIE_KEY } =
      loadAuthWithSignOutFetch(memory, () =>
        Promise.reject(new Error('network')),
      )

    await signOutIgnoringFailure(auth)
    expect(memory.get(SESSION_COOKIE_KEY)).toBe(SESSION_COOKIE_JSON)
    expect(auth.getSessionCookie()).toContain(SESSION_TOKEN)
    expect(cookieHeaders[0]).toContain(SESSION_TOKEN)

    await signOutIgnoringFailure(auth)
    expect(cookieHeaders[1]).toContain(SESSION_TOKEN)
    await new Promise((resolve) => setTimeout(resolve, 50))
  })

  it('keeps the session cookie after a 500 sign-out so a retry can revoke', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {})
    const { auth, cookieHeaders, SESSION_COOKIE_KEY } =
      loadAuthWithSignOutFetch(memory, () =>
        Promise.resolve(
          new Response(JSON.stringify({ message: 'unavailable' }), {
            status: 500,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      )

    await signOutIgnoringFailure(auth)
    expect(memory.get(SESSION_COOKIE_KEY)).toBe(SESSION_COOKIE_JSON)
    expect(auth.getSessionCookie()).toContain(SESSION_TOKEN)
    expect(cookieHeaders[0]).toContain(SESSION_TOKEN)

    await signOutIgnoringFailure(auth)
    expect(cookieHeaders[1]).toContain(SESSION_TOKEN)
    await new Promise((resolve) => setTimeout(resolve, 50))
  })

  it('clears the session cookie after a successful sign-out', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {})
    const { auth, SESSION_COOKIE_KEY } = loadAuthWithSignOutFetch(
      memory,
      () =>
        Promise.resolve(
          new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ),
    )

    await signOutIgnoringFailure(auth)
    expect(memory.get(SESSION_COOKIE_KEY)).toBe('{}')
    expect(auth.getSessionCookie()).not.toContain(SESSION_TOKEN)
    await new Promise((resolve) => setTimeout(resolve, 50))
  })
})
