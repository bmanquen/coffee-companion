import { act, renderHook } from '@testing-library/react-native'
import {
  ERROR_PLAY_SERVICES,
  ERROR_SIGN_IN_CONFLICT_BODY,
  ERROR_SIGN_IN_CONFLICT_TITLE,
  ERROR_SIGN_IN_FAILED,
  ERROR_SIGN_IN_UNAVAILABLE,
  ERROR_SIGN_OUT_FAILED,
} from './copy'
import {
  PlayServicesMissing,
  SignInCancelled,
  SignInConflict,
  SignInFailed,
  SignInUnavailable,
} from './errors'
import { E2E_USER_ENV, E2E_USER_WITH_DATA } from './e2e'
import { useAuth } from './use-auth'

const mocks = {
  signInWithGoogle: jest.fn(),
  signInWithApple: jest.fn(),
  signOutGoogle: jest.fn(),
  signOut: jest.fn(),
  getSession: jest.fn(),
  refetchClientSession: jest.fn(),
  clearClientSession: jest.fn(),
  clearSessionStore: jest.fn(),
  writeE2EAuthCookie: jest.fn(),
  readSessionCookie: jest.fn(),
  restoreSessionCookie: jest.fn(),
  appleAvailable: true,
  session: null as null | { user: { name: string } },
  pending: false,
}

jest.mock('./apple', () => ({
  appleSignInAvailable: () => mocks.appleAvailable,
  signInWithApple: () => mocks.signInWithApple(),
}))

jest.mock('./google', () => ({
  signInWithGoogle: () => mocks.signInWithGoogle(),
  signOutGoogle: () => mocks.signOutGoogle(),
}))

jest.mock('./session-store', () => ({
  ...jest.requireActual('./session-store'),
  clearSessionStore: () => mocks.clearSessionStore(),
  writeE2EAuthCookie: (userId: string) => mocks.writeE2EAuthCookie(userId),
  readSessionCookie: () => mocks.readSessionCookie(),
  restoreSessionCookie: (raw: string | null) => mocks.restoreSessionCookie(raw),
}))

jest.mock('./auth-client', () => ({
  authClient: {
    useSession: () => ({ data: mocks.session, isPending: mocks.pending }),
    signOut: () => mocks.signOut(),
    getSession: (...args: Array<unknown>) => mocks.getSession(...args),
  },
  refetchClientSession: () => mocks.refetchClientSession(),
  clearClientSession: () => mocks.clearClientSession(),
}))

describe('useAuth', () => {
  let consoleError: jest.SpyInstance
  const previousE2EUser = process.env[E2E_USER_ENV]

  beforeEach(() => {
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    mocks.signInWithGoogle.mockReset()
    mocks.signInWithApple.mockReset()
    mocks.signOutGoogle.mockReset()
    mocks.signOut.mockReset()
    mocks.signOut.mockResolvedValue({})
    mocks.getSession.mockReset()
    mocks.refetchClientSession.mockReset()
    mocks.clearClientSession.mockReset()
    mocks.clearSessionStore.mockReset()
    mocks.writeE2EAuthCookie.mockReset()
    mocks.readSessionCookie.mockReset()
    mocks.restoreSessionCookie.mockReset()
    mocks.readSessionCookie.mockReturnValue(null)
    mocks.restoreSessionCookie.mockResolvedValue(undefined)
    mocks.appleAvailable = true
    mocks.session = null
    mocks.pending = false
  })

  afterEach(() => {
    consoleError.mockRestore()
    if (previousE2EUser === undefined) delete process.env[E2E_USER_ENV]
    else process.env[E2E_USER_ENV] = previousE2EUser
  })

  it('swallows a cancelled press', async () => {
    mocks.signInWithGoogle.mockRejectedValueOnce(new SignInCancelled())
    const { result } = await renderHook(() => useAuth())

    await act(async () => {
      await result.current.signInGoogle()
    })

    expect(result.current.error).toBeNull()
  })

  it('names the failures a user can see', async () => {
    const { result } = await renderHook(() => useAuth())

    mocks.signInWithGoogle.mockRejectedValueOnce(new SignInUnavailable())
    await act(async () => {
      await result.current.signInGoogle()
    })
    expect(result.current.error).toEqual({ title: ERROR_SIGN_IN_UNAVAILABLE })

    mocks.signInWithGoogle.mockRejectedValueOnce(new PlayServicesMissing())
    await act(async () => {
      await result.current.signInGoogle()
    })
    expect(result.current.error).toEqual({ title: ERROR_PLAY_SERVICES })

    mocks.signInWithGoogle.mockRejectedValueOnce(new SignInFailed())
    await act(async () => {
      await result.current.signInGoogle()
    })
    expect(result.current.error).toEqual({
      title: ERROR_SIGN_IN_FAILED,
      body: 'failed',
    })

    mocks.signInWithGoogle.mockRejectedValueOnce(new SignInConflict())
    await act(async () => {
      await result.current.signInGoogle()
    })
    expect(result.current.error).toEqual({
      title: ERROR_SIGN_IN_CONFLICT_TITLE,
      body: ERROR_SIGN_IN_CONFLICT_BODY,
    })

    mocks.signInWithApple.mockRejectedValueOnce(new SignInConflict())
    await act(async () => {
      await result.current.signInApple()
    })
    expect(result.current.error).toEqual({
      title: ERROR_SIGN_IN_CONFLICT_TITLE,
      body: ERROR_SIGN_IN_CONFLICT_BODY,
    })
  })

  it('clears the secure session on sign-out', async () => {
    const { result } = await renderHook(() => useAuth())

    await act(async () => {
      await result.current.signOut()
    })

    expect(mocks.signOutGoogle).toHaveBeenCalled()
    expect(mocks.signOut).toHaveBeenCalled()
    expect(mocks.clearSessionStore).toHaveBeenCalled()
    expect(mocks.clearClientSession).toHaveBeenCalled()
    expect(mocks.clearClientSession.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.clearSessionStore.mock.invocationCallOrder[0],
    )
  })

  it('signs out locally and reports it when remote sign-out fails', async () => {
    mocks.signOut.mockResolvedValueOnce({ error: { message: 'network' } })
    const { result } = await renderHook(() => useAuth())

    await act(async () => {
      await result.current.signOut()
    })

    expect(mocks.clearSessionStore).toHaveBeenCalled()
    expect(mocks.clearClientSession).toHaveBeenCalled()
    expect(result.current.error).toEqual({ title: ERROR_SIGN_OUT_FAILED })
  })

  it('signs out locally when the sign-out request throws', async () => {
    mocks.signOut.mockRejectedValueOnce(new Error('network'))
    const { result } = await renderHook(() => useAuth())

    await act(async () => {
      await result.current.signOut()
    })

    expect(mocks.clearSessionStore).toHaveBeenCalled()
    expect(mocks.clearClientSession).toHaveBeenCalled()
    expect(result.current.error).toEqual({ title: ERROR_SIGN_OUT_FAILED })
  })

  it('clears the client session when store deletion fails', async () => {
    mocks.clearSessionStore.mockRejectedValueOnce(new Error('secure store'))
    const { result } = await renderHook(() => useAuth())

    await act(async () => {
      await expect(result.current.signOut()).rejects.toThrow('secure store')
    })

    expect(mocks.clearSessionStore).toHaveBeenCalled()
    expect(mocks.clearClientSession).toHaveBeenCalled()
  })

  it('still revokes the server session when Google sign-out throws', async () => {
    mocks.signOutGoogle.mockRejectedValueOnce(new Error('offline'))
    const { result } = await renderHook(() => useAuth())

    await act(async () => {
      await result.current.signOut()
    })

    expect(mocks.signOut).toHaveBeenCalled()
    expect(mocks.clearSessionStore).toHaveBeenCalled()
    expect(mocks.clearClientSession).toHaveBeenCalled()
  })

  it('writes the e2e cookie and refetches the session atom', async () => {
    process.env[E2E_USER_ENV] = E2E_USER_WITH_DATA
    mocks.refetchClientSession.mockResolvedValueOnce({
      user: { name: 'E2E Tester', email: 'e2e-user-with-data@example.com' },
    })
    const { result } = await renderHook(() => useAuth())

    await act(async () => {
      await result.current.signInE2E()
    })

    expect(mocks.writeE2EAuthCookie).toHaveBeenCalledWith(E2E_USER_WITH_DATA)
    expect(mocks.refetchClientSession).toHaveBeenCalled()
    expect(mocks.restoreSessionCookie).not.toHaveBeenCalled()
    expect(result.current.error).toBeNull()
  })

  it('surfaces a failed e2e get-session instead of staying silently signed out', async () => {
    process.env[E2E_USER_ENV] = E2E_USER_WITH_DATA
    mocks.refetchClientSession.mockResolvedValueOnce(null)
    const { result } = await renderHook(() => useAuth())

    await act(async () => {
      await result.current.signInE2E()
    })

    expect(result.current.error).toEqual({
      title: ERROR_SIGN_IN_FAILED,
      body: 'E2E get-session returned no session',
    })
    expect(mocks.restoreSessionCookie).toHaveBeenCalledWith(null)
  })

  it('restores the prior cookie when e2e get-session throws', async () => {
    process.env[E2E_USER_ENV] = E2E_USER_WITH_DATA
    mocks.readSessionCookie.mockReturnValueOnce('prior-cookie')
    mocks.refetchClientSession.mockRejectedValueOnce(new Error('network'))
    const { result } = await renderHook(() => useAuth())

    await act(async () => {
      await result.current.signInE2E()
    })

    expect(mocks.restoreSessionCookie).toHaveBeenCalledWith('prior-cookie')
    expect(result.current.error).toEqual({
      title: ERROR_SIGN_IN_FAILED,
      body: 'network',
    })
  })

  it('keeps the get-session error when cookie restore also fails', async () => {
    process.env[E2E_USER_ENV] = E2E_USER_WITH_DATA
    mocks.refetchClientSession.mockRejectedValueOnce(new Error('network'))
    mocks.restoreSessionCookie.mockRejectedValueOnce(new Error('secure store'))
    const { result } = await renderHook(() => useAuth())

    await act(async () => {
      await result.current.signInE2E()
    })

    expect(mocks.restoreSessionCookie).toHaveBeenCalled()
    expect(result.current.error).toEqual({
      title: ERROR_SIGN_IN_FAILED,
      body: 'network',
    })
  })

  it('ignores a second e2e sign-in while the first refetch is in flight', async () => {
    process.env[E2E_USER_ENV] = E2E_USER_WITH_DATA
    let release!: (value: {
      user: { name: string; email: string }
    }) => void
    mocks.refetchClientSession.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve
        }),
    )
    const { result } = await renderHook(() => useAuth())

    let first!: Promise<void>
    let second!: Promise<void>
    await act(() => {
      first = result.current.signInE2E()
      second = result.current.signInE2E()
    })

    expect(mocks.writeE2EAuthCookie).toHaveBeenCalledTimes(1)
    expect(mocks.refetchClientSession).toHaveBeenCalledTimes(1)

    await act(async () => {
      release({
        user: { name: 'E2E Tester', email: 'e2e-user-with-data@example.com' },
      })
      await first
      await second
    })

    expect(mocks.writeE2EAuthCookie).toHaveBeenCalledTimes(1)
    expect(result.current.error).toBeNull()
  })

  it('does not write a cookie when the e2e persona is unset', async () => {
    delete process.env[E2E_USER_ENV]
    const { result } = await renderHook(() => useAuth())

    await act(async () => {
      await result.current.signInE2E()
    })

    expect(mocks.writeE2EAuthCookie).not.toHaveBeenCalled()
    expect(mocks.refetchClientSession).not.toHaveBeenCalled()
  })
})
