import {
  AUTH_LOG_PREFIX,
  logApiBaseUrl,
  logAuthFailure,
  logAuthRequest,
  loggedAuthFetch,
  serverFailureDetail,
} from './log'

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
    logAuthRequest('http://127.0.0.1:3910/api/auth/get-session', 200, false)
    expect(log).not.toHaveBeenCalled()
    log.mockRestore()
  })
})

describe('loggedAuthFetch', () => {
  it('logs status on success and still logs the URL when fetch throws', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {})
    const ok = { status: 200 } as Response
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
      `${AUTH_LOG_PREFIX} request http://127.0.0.1:3910/api/auth/get-session status=200`,
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
      `${AUTH_LOG_PREFIX} request http://127.0.0.1:8081/api/auth/get-session`,
    )
    log.mockRestore()
  })
})
