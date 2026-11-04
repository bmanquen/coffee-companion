import { E2E_AUTH_COOKIE_NAME, E2E_AUTH_HEADER, E2E_USER_WITH_DATA } from './e2e'
import {
  SESSION_COOKIE_KEY,
  SESSION_DATA_KEY,
  clearSessionStore,
  e2eAuthCookieStore,
  e2eAuthRequestHeaders,
  e2eAuthUserFromCookieStore,
  writeE2EAuthCookie,
} from './session-store'

const mockDeleteItemAsync = jest.fn()
const mockSetItem = jest.fn()

jest.mock('expo-secure-store', () => ({
  getItem: jest.fn(() => null),
  setItem: (...args: [string, string]) => mockSetItem(...args),
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(() => undefined),
  deleteItemAsync: (...args: [string]) => mockDeleteItemAsync(...args),
}))

describe('writeE2EAuthCookie', () => {
  it('stores e2e_auth in the expoClient cookie map', () => {
    writeE2EAuthCookie(E2E_USER_WITH_DATA)

    expect(mockSetItem).toHaveBeenCalledWith(
      SESSION_COOKIE_KEY,
      e2eAuthCookieStore(E2E_USER_WITH_DATA),
    )
    expect(JSON.parse(e2eAuthCookieStore(E2E_USER_WITH_DATA))).toEqual({
      [E2E_AUTH_COOKIE_NAME]: { value: E2E_USER_WITH_DATA, expires: null },
    })
  })
})

describe('e2eAuthRequestHeaders', () => {
  it('sends Cookie and x-e2e-auth for the expoClient cookie map', () => {
    expect(e2eAuthRequestHeaders(E2E_USER_WITH_DATA)).toEqual({
      cookie: `${E2E_AUTH_COOKIE_NAME}=${E2E_USER_WITH_DATA}`,
      [E2E_AUTH_HEADER]: E2E_USER_WITH_DATA,
    })
    expect(
      e2eAuthUserFromCookieStore(e2eAuthCookieStore(E2E_USER_WITH_DATA)),
    ).toBe(E2E_USER_WITH_DATA)
    expect(
      e2eAuthUserFromCookieStore(
        JSON.stringify({ 'better-auth.session_token': { value: 'tok' } }),
      ),
    ).toBeNull()
  })
})

describe('clearSessionStore', () => {
  it('deletes the session cookie and cached session from secure storage', async () => {
    await clearSessionStore()

    expect(mockDeleteItemAsync).toHaveBeenCalledWith(SESSION_COOKIE_KEY)
    expect(mockDeleteItemAsync).toHaveBeenCalledWith(SESSION_DATA_KEY)
  })
})
