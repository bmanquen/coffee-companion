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

type SessionAtomValue = {
  data: { user?: { id?: string } | null } | null
  error: unknown
  isPending: boolean
  isRefetching: boolean
  refetch: () => Promise<unknown>
}

type SignOutAuth = {
  authClient: { signOut: () => Promise<unknown> }
  getSessionCookie: () => string
  sessionAtom: () => {
    get: () => SessionAtomValue
    set: (value: SessionAtomValue) => void
    listen: (listener: () => void) => () => void
  }
}

const SESSION_USER_ID = 'user-signed-in'
const SESSION_BODY = {
  user: { id: SESSION_USER_ID, name: 'Pat', email: 'pat@example.com' },
  session: { id: 'session-1', userId: SESSION_USER_ID },
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

async function waitUntil(predicate: () => boolean, label: string) {
  const started = Date.now()
  while (!predicate()) {
    if (Date.now() - started > 1000) {
      throw new Error(`timed out waiting for ${label}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

function requestUrl(input: RequestInfo | URL) {
  return typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.href
      : input.url
}

function requestHeaders(input: RequestInfo | URL, init?: RequestInit) {
  return new Headers(
    init?.headers ??
      (input instanceof Request ? input.headers : undefined),
  )
}

function loadAuthClient(
  memory: Map<string, string>,
  fetchImpl: (
    url: string,
    headers: Headers,
  ) => Promise<Response>,
) {
  globalThis.fetch = jest.fn((input, init) => {
    return fetchImpl(requestUrl(input), requestHeaders(input, init))
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
  return { auth, SESSION_COOKIE_KEY: sessionStore.SESSION_COOKIE_KEY }
}

function loadAuthWithSignOutFetch(
  memory: Map<string, string>,
  signOutFetch: (headers: Headers) => Promise<Response>,
) {
  const cookieHeaders: Array<string | null> = []
  const loaded = loadAuthClient(memory, (url, headers) => {
    if (url.includes('/sign-out')) {
      cookieHeaders.push(headers.get('cookie'))
      return signOutFetch(headers)
    }
    return Promise.resolve(jsonResponse(null))
  })
  return { ...loaded, cookieHeaders }
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

  it('keeps the session after a cookie-less get-session returns null past a failed sign-out', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {})
    const getSessionWaiters: Array<(value: Response) => void> = []
    const getSessionCookies: Array<string | null> = []
    let rejectSignOut: (reason: Error) => void = () => {}
    const signOutPending = new Promise<Response>((_resolve, reject) => {
      rejectSignOut = reject
    })

    const { auth, SESSION_COOKIE_KEY } = loadAuthClient(
      memory,
      (url, headers) => {
        if (url.includes('/sign-out')) {
          return signOutPending
        }
        if (url.includes('/get-session')) {
          getSessionCookies.push(headers.get('cookie'))
          return new Promise((resolve) => {
            getSessionWaiters.push(resolve)
          })
        }
        return Promise.resolve(jsonResponse(null))
      },
    )

    await waitUntil(() => getSessionWaiters.length > 0, 'first get-session')
    getSessionWaiters.shift()?.(jsonResponse(SESSION_BODY))
    await waitUntil(
      () => auth.sessionAtom().get().data?.user?.id === SESSION_USER_ID,
      'session atom to load',
    )

    const signOutDone = auth.authClient.signOut()
    await waitUntil(
      () => memory.get(SESSION_COOKIE_KEY) === '{}',
      'cookie clear during sign-out',
    )

    const refreshDone = auth.sessionAtom().get().refetch()
    await waitUntil(
      () => getSessionWaiters.length > 0,
      'cookie-less get-session',
    )
    expect(getSessionCookies.at(-1) ?? '').not.toContain(SESSION_TOKEN)

    rejectSignOut(new Error('network'))
    await signOutDone.catch(() => undefined)
    expect(memory.get(SESSION_COOKIE_KEY)).toBe(SESSION_COOKIE_JSON)
    expect(auth.sessionAtom().get().data?.user?.id).toBe(SESSION_USER_ID)

    getSessionWaiters.shift()?.(jsonResponse(null))
    await refreshDone.catch(() => undefined)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(auth.sessionAtom().get().data?.user?.id).toBe(SESSION_USER_ID)

    const laterRefresh = auth.sessionAtom().get().refetch()
    await waitUntil(
      () => getSessionWaiters.length > 0,
      'post-restore get-session',
    )
    expect(getSessionCookies.at(-1) ?? '').toContain(SESSION_TOKEN)
    getSessionWaiters.shift()?.(jsonResponse(null))
    await laterRefresh.catch(() => undefined)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(auth.sessionAtom().get().data?.user?.id).toBeUndefined()
  })
})
