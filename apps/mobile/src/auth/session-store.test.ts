import {
  SESSION_COOKIE_KEY,
  SESSION_DATA_KEY,
  clearSessionStore,
} from './session-store'

const mockDeleteItemAsync = jest.fn()

jest.mock('expo-secure-store', () => ({
  getItem: jest.fn(() => null),
  setItem: jest.fn(),
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(() => undefined),
  deleteItemAsync: (...args: [string]) => mockDeleteItemAsync(...args),
}))

describe('clearSessionStore', () => {
  it('deletes the session cookie and cached session from secure storage', async () => {
    await clearSessionStore()

    expect(mockDeleteItemAsync).toHaveBeenCalledWith(SESSION_COOKIE_KEY)
    expect(mockDeleteItemAsync).toHaveBeenCalledWith(SESSION_DATA_KEY)
  })
})
