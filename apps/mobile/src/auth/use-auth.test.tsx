import { act, renderHook } from '@testing-library/react-native'
import {
  ERROR_PLAY_SERVICES,
  ERROR_SIGN_IN_CONFLICT_BODY,
  ERROR_SIGN_IN_CONFLICT_TITLE,
  ERROR_SIGN_IN_FAILED,
  ERROR_SIGN_IN_UNAVAILABLE,
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
  clearSessionStore: jest.fn(),
  writeE2EAuthCookie: jest.fn(),
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
  clearSessionStore: () => mocks.clearSessionStore(),
  writeE2EAuthCookie: (userId: string) => mocks.writeE2EAuthCookie(userId),
}))

jest.mock('./auth-client', () => ({
  authClient: {
    useSession: () => ({ data: mocks.session, isPending: mocks.pending }),
    signOut: () => mocks.signOut(),
    getSession: () => mocks.getSession(),
  },
}))

describe('useAuth', () => {
  beforeEach(() => {
    mocks.signInWithGoogle.mockReset()
    mocks.signInWithApple.mockReset()
    mocks.signOutGoogle.mockReset()
    mocks.signOut.mockReset()
    mocks.getSession.mockReset()
    mocks.clearSessionStore.mockReset()
    mocks.writeE2EAuthCookie.mockReset()
    mocks.appleAvailable = true
    mocks.session = null
    mocks.pending = false
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
    expect(result.current.error).toEqual({ title: ERROR_SIGN_IN_FAILED })

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
  })

  it('clears the secure session when remote sign-out fails', async () => {
    mocks.signOut.mockRejectedValueOnce(new Error('network'))
    const { result } = await renderHook(() => useAuth())

    await act(async () => {
      await expect(result.current.signOut()).rejects.toThrow('network')
    })

    expect(mocks.clearSessionStore).toHaveBeenCalled()
  })

  it('still revokes the server session when Google sign-out throws', async () => {
    mocks.signOutGoogle.mockRejectedValueOnce(new Error('offline'))
    const { result } = await renderHook(() => useAuth())

    await act(async () => {
      await result.current.signOut()
    })

    expect(mocks.signOut).toHaveBeenCalled()
    expect(mocks.clearSessionStore).toHaveBeenCalled()
  })

  it('writes the e2e cookie and asks the auth client for the session', async () => {
    const previous = process.env[E2E_USER_ENV]
    process.env[E2E_USER_ENV] = E2E_USER_WITH_DATA
    mocks.getSession.mockResolvedValueOnce({
      data: { user: { name: 'E2E Tester', email: 'e2e-user-with-data@example.com' } },
    })
    const { result } = await renderHook(() => useAuth())

    await act(async () => {
      await result.current.signInE2E()
    })

    expect(mocks.writeE2EAuthCookie).toHaveBeenCalledWith(E2E_USER_WITH_DATA)
    expect(mocks.getSession).toHaveBeenCalled()
    expect(result.current.error).toBeNull()
    if (previous === undefined) delete process.env[E2E_USER_ENV]
    else process.env[E2E_USER_ENV] = previous
  })

  it('surfaces a failed e2e get-session instead of staying silently signed out', async () => {
    const previous = process.env[E2E_USER_ENV]
    process.env[E2E_USER_ENV] = E2E_USER_WITH_DATA
    mocks.getSession.mockResolvedValueOnce({ data: null })
    const { result } = await renderHook(() => useAuth())

    await act(async () => {
      await result.current.signInE2E()
    })

    expect(result.current.error).toEqual({ title: ERROR_SIGN_IN_FAILED })
    if (previous === undefined) delete process.env[E2E_USER_ENV]
    else process.env[E2E_USER_ENV] = previous
  })

  it('does not write a cookie when the e2e persona is unset', async () => {
    const previous = process.env[E2E_USER_ENV]
    delete process.env[E2E_USER_ENV]
    const { result } = await renderHook(() => useAuth())

    await act(async () => {
      await result.current.signInE2E()
    })

    expect(mocks.writeE2EAuthCookie).not.toHaveBeenCalled()
    expect(mocks.getSession).not.toHaveBeenCalled()
    if (previous === undefined) delete process.env[E2E_USER_ENV]
    else process.env[E2E_USER_ENV] = previous
  })
})
