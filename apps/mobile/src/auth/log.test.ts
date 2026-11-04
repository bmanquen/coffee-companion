import * as SecureStore from 'expo-secure-store'
import { E2E_AUTH_HEADER, E2E_USER_WITH_DATA } from './e2e'
import {
  AUTH_LOG_PREFIX,
  logApiBaseUrl,
  logAuthFailure,
  logAuthRequest,
  loggedAuthFetch,
  serverFailureDetail,
} from './log'
import { writeE2EAuthCookie } from './session-store'

describe('logAuthFailure', () => {
  it('writes a prefixed code and message in development and stays silent in production', () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {})

    logAuthFailure(
      'google',
      { code: '10', message: 'DEVELOPER_ERROR' },
      true,
    )
    expect(error).toHaveBeenCalledTimes(1)
    expect(error.mock.calls[0][0]).toBe(
      `${AUTH_LOG_PREFIX} google: code=10 message=DEVELOPER_ERROR`,
    )

    error.mockClear()
    logAuthFailure(
      'google',
      { code: '10', message: 'DEVELOPER_ERROR' },
      false,
    )
    expect(error).not.toHaveBeenCalled()
    error.mockRestore()
  })

  it('logs server status, code, and message without tokens or a response body', () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {})

    logAuthFailure(
      'google-server',
      serverFailureDetail({
        status: 401,
        code: 'INVALID_TOKEN',
        message: 'id token is not valid',
        idToken: 'secret-id-token',
        body: { token: 'secret-body', authorizationCode: 'secret-code' },
      }),
      true,
    )

    const line = String(error.mock.calls[0][0])
    expect(line).toBe(
      `${AUTH_LOG_PREFIX} google-server: status=401 code=INVALID_TOKEN message=id token is not valid`,
    )
    expect(line).not.toContain('secret-id-token')
    expect(line).not.toContain('secret-body')
    expect(line).not.toContain('secret-code')
    error.mockRestore()
  })
})

describe('logApiBaseUrl', () => {
  it('writes the resolved URL and doctor tag in development', () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {})

    logApiBaseUrl('http://127.0.0.1:3910', 'cc-api-url:http://127.0.0.1:3910', true)
    expect(log).toHaveBeenCalledWith(
      `${AUTH_LOG_PREFIX} api-url http://127.0.0.1:3910 cc-api-url:http://127.0.0.1:3910`,
    )

    log.mockClear()
    logApiBaseUrl('http://127.0.0.1:3910', 'cc-api-url:http://127.0.0.1:3910', false)
    expect(log).not.toHaveBeenCalled()
    log.mockRestore()
  })
})

describe('logAuthRequest', () => {
  it('writes the request URL and status in development', () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {})

    logAuthRequest('http://127.0.0.1:3910/api/auth/get-session', 500, true)
    expect(log).toHaveBeenCalledWith(
      `${AUTH_LOG_PREFIX} request http://127.0.0.1:3910/api/auth/get-session status=500`,
    )

    log.mockClear()
    logAuthRequest(
      'http://127.0.0.1:3910/api/auth/get-session',
      200,
      true,
      { names: ['expo-origin', 'x-e2e-auth'], e2eAuth: true },
      'user=e2e-user-with-data',
    )
    expect(log).toHaveBeenCalledWith(
      `${AUTH_LOG_PREFIX} request http://127.0.0.1:3910/api/auth/get-session status=200 headers=expo-origin,x-e2e-auth e2e-auth=1 session=user=e2e-user-with-data`,
    )

    log.mockClear()
    logAuthRequest('http://127.0.0.1:3910/api/auth/get-session', 200, false)
    expect(log).not.toHaveBeenCalled()
    log.mockRestore()
  })
})

describe('loggedAuthFetch', () => {
  it('logs status on success and still logs the URL when fetch throws', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {})
    const ok = new Response('null', { status: 200 })
    const impl = jest.fn(() => Promise.resolve(ok))

    await expect(
      loggedAuthFetch(
        'http://127.0.0.1:3910/api/auth/get-session',
        undefined,
        true,
        impl,
      ),
    ).resolves.toBe(ok)
    expect(log).toHaveBeenCalledWith(
      `${AUTH_LOG_PREFIX} request http://127.0.0.1:3910/api/auth/get-session status=200 headers=none e2e-auth=0 session=null`,
    )

    log.mockClear()
    const failing = jest.fn(() => Promise.reject(new Error('network')))
    await expect(
      loggedAuthFetch(
        'http://127.0.0.1:8081/api/auth/get-session',
        undefined,
        true,
        failing,
      ),
    ).rejects.toThrow('network')
    expect(log).toHaveBeenCalledWith(
      `${AUTH_LOG_PREFIX} request http://127.0.0.1:8081/api/auth/get-session headers=none e2e-auth=0`,
    )
    log.mockRestore()
  })

  it('sets x-e2e-auth from the cookie store on the outgoing request', async () => {
    const memory = new Map<string, string>()
    jest.mocked(SecureStore.getItem).mockImplementation((key) => memory.get(key) ?? null)
    jest.mocked(SecureStore.setItem).mockImplementation((key, value) => {
      memory.set(key, value)
    })
    writeE2EAuthCookie(E2E_USER_WITH_DATA)

    let outgoing: RequestInit | undefined
    const impl = jest.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      outgoing = init
      return Promise.resolve(
        new Response(JSON.stringify({ user: { id: E2E_USER_WITH_DATA } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
    })
    const log = jest.spyOn(console, 'log').mockImplementation(() => {})

    await loggedAuthFetch(
      'http://127.0.0.1:3910/api/auth/get-session',
      { headers: { 'expo-origin': 'coffeecompanion://' } },
      true,
      impl,
    )

    expect(new Headers(outgoing?.headers).get(E2E_AUTH_HEADER)).toBe(
      E2E_USER_WITH_DATA,
    )
    expect(log).toHaveBeenCalledWith(
      `${AUTH_LOG_PREFIX} request http://127.0.0.1:3910/api/auth/get-session status=200 headers=expo-origin,x-e2e-auth e2e-auth=1 session=user=${E2E_USER_WITH_DATA}`,
    )
    log.mockRestore()
    jest.mocked(SecureStore.getItem).mockReset()
    jest.mocked(SecureStore.setItem).mockReset()
  })

  it('keeps Request headers when adding x-e2e-auth', async () => {
    const memory = new Map<string, string>()
    jest.mocked(SecureStore.getItem).mockImplementation((key) => memory.get(key) ?? null)
    jest.mocked(SecureStore.setItem).mockImplementation((key, value) => {
      memory.set(key, value)
    })
    writeE2EAuthCookie(E2E_USER_WITH_DATA)

    let outgoing: RequestInit | undefined
    const impl = jest.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      outgoing = init
      return Promise.resolve(new Response('null', { status: 200 }))
    })
    const log = jest.spyOn(console, 'log').mockImplementation(() => {})

    await loggedAuthFetch(
      new Request('http://127.0.0.1:3910/api/auth/get-session', {
        headers: {
          authorization: 'Bearer keep-me',
          'content-type': 'application/json',
        },
      }),
      { headers: { 'expo-origin': 'coffeecompanion://' } },
      true,
      impl,
    )

    const headers = new Headers(outgoing?.headers)
    expect(headers.get('authorization')).toBe('Bearer keep-me')
    expect(headers.get('content-type')).toBe('application/json')
    expect(headers.get('expo-origin')).toBe('coffeecompanion://')
    expect(headers.get(E2E_AUTH_HEADER)).toBe(E2E_USER_WITH_DATA)
    log.mockRestore()
    jest.mocked(SecureStore.getItem).mockReset()
    jest.mocked(SecureStore.setItem).mockReset()
  })

  it('does not set x-e2e-auth in a production build', async () => {
    const memory = new Map<string, string>()
    jest.mocked(SecureStore.getItem).mockImplementation((key) => memory.get(key) ?? null)
    jest.mocked(SecureStore.setItem).mockImplementation((key, value) => {
      memory.set(key, value)
    })
    writeE2EAuthCookie(E2E_USER_WITH_DATA)

    let outgoing: RequestInit | undefined
    const impl = jest.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      outgoing = init
      return Promise.resolve(new Response('null', { status: 200 }))
    })
    const clone = jest.spyOn(Response.prototype, 'clone')

    await loggedAuthFetch(
      'http://127.0.0.1:3910/api/auth/get-session',
      { headers: { 'expo-origin': 'coffeecompanion://' } },
      false,
      impl,
    )

    expect(new Headers(outgoing?.headers).get(E2E_AUTH_HEADER)).toBeNull()
    expect(SecureStore.getItem).not.toHaveBeenCalled()
    expect(clone).not.toHaveBeenCalled()
    clone.mockRestore()
    jest.mocked(SecureStore.getItem).mockReset()
    jest.mocked(SecureStore.setItem).mockReset()
  })
})
