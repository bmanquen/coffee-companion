import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native'
import * as SecureStore from 'expo-secure-store'
import { App } from '../App'
import { WELCOME_SCREEN_TEST_ID } from '../welcome'
import { sessionAtom } from './auth-client'
import { E2E_AUTH_HEADER, E2E_USER_ENV, E2E_USER_WITH_DATA } from './e2e'
import { E2E_SIGN_IN_TEST_ID } from './SignInScreen'
import { SESSION_COOKIE_KEY } from './session-store'

const memory = new Map<string, string>()

function e2eSessionBody(userId: string) {
  return {
    user: {
      id: userId,
      name: 'E2E Tester',
      email: `${userId}@example.com`,
    },
    session: {
      id: `e2e-session-${userId}`,
      userId,
    },
  }
}

describe('E2E sign-in path', () => {
  const previousUser = process.env[E2E_USER_ENV]
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    memory.clear()
    process.env[E2E_USER_ENV] = E2E_USER_WITH_DATA
    const atom = sessionAtom()
    atom.set({
      data: null,
      error: null,
      isPending: false,
      isRefetching: false,
      refetch: atom.get().refetch,
    })
    jest.mocked(SecureStore.getItem).mockImplementation((key) => memory.get(key) ?? null)
    jest.mocked(SecureStore.setItem).mockImplementation((key, value) => {
      memory.set(key, value)
    })
    globalThis.fetch = jest.fn((_input, init) => {
      const headers = new Headers(init?.headers)
      const userId = headers.get(E2E_AUTH_HEADER)?.trim()
      if (userId) {
        return Promise.resolve(
          new Response(JSON.stringify(e2eSessionBody(userId)), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        )
      }
      return Promise.resolve(
        new Response('null', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
    }) as typeof fetch
  })

  afterEach(() => {
    cleanup()
    globalThis.fetch = originalFetch
    if (previousUser === undefined) delete process.env[E2E_USER_ENV]
    else process.env[E2E_USER_ENV] = previousUser
  })

  it('sends x-e2e-auth through the real client and transitions to welcome', async () => {
    await render(<App />)

    await waitFor(() => {
      expect(screen.getByTestId(E2E_SIGN_IN_TEST_ID)).toBeTruthy()
    })

    await act(async () => {
      fireEvent.press(screen.getByTestId(E2E_SIGN_IN_TEST_ID))
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(screen.getByTestId(WELCOME_SCREEN_TEST_ID)).toBeTruthy()
    })
    expect(screen.getByText('E2E Tester')).toBeTruthy()
    expect(memory.get(SESSION_COOKIE_KEY)).toContain(E2E_USER_WITH_DATA)
    const authed = jest
      .mocked(globalThis.fetch)
      .mock.calls.some(([, init]) =>
        new Headers(init?.headers).get(E2E_AUTH_HEADER) === E2E_USER_WITH_DATA,
      )
    expect(authed).toBe(true)
  })
})
