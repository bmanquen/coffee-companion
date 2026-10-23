import { AUTH_LOG_PREFIX, logAuthFailure, serverFailureDetail } from './log'

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
