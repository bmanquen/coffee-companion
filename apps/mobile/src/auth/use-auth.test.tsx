import { act, renderHook } from '@testing-library/react-native'
import {
  ERROR_PLAY_SERVICES,
  ERROR_SIGN_IN_FAILED,
  ERROR_SIGN_IN_UNAVAILABLE,
} from './copy'
import {
  PlayServicesMissing,
  SignInCancelled,
  SignInFailed,
  SignInUnavailable,
} from './errors'
import { useAuth } from './use-auth'

const mocks = {
  signInWithGoogle: jest.fn(),
  signInWithApple: jest.fn(),
  signOutGoogle: jest.fn(),
  signOut: jest.fn(),
  clearSessionStore: jest.fn(),
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
}))

jest.mock('./auth-client', () => ({
  authClient: {
    useSession: () => ({ data: mocks.session, isPending: mocks.pending }),
    signOut: () => mocks.signOut(),
  },
}))

describe('useAuth', () => {
  beforeEach(() => {
    mocks.signInWithGoogle.mockReset()
    mocks.signInWithApple.mockReset()
    mocks.signOutGoogle.mockReset()
    mocks.signOut.mockReset()
    mocks.clearSessionStore.mockReset()
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

  it('names the three failures a user can see', async () => {
    const { result } = await renderHook(() => useAuth())

    mocks.signInWithGoogle.mockRejectedValueOnce(new SignInUnavailable())
    await act(async () => {
      await result.current.signInGoogle()
    })
    expect(result.current.error).toBe(ERROR_SIGN_IN_UNAVAILABLE)

    mocks.signInWithGoogle.mockRejectedValueOnce(new PlayServicesMissing())
    await act(async () => {
      await result.current.signInGoogle()
    })
    expect(result.current.error).toBe(ERROR_PLAY_SERVICES)

    mocks.signInWithGoogle.mockRejectedValueOnce(new SignInFailed())
    await act(async () => {
      await result.current.signInGoogle()
    })
    expect(result.current.error).toBe(ERROR_SIGN_IN_FAILED)
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
})
