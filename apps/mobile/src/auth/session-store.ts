import * as SecureStore from 'expo-secure-store'

export const SESSION_STORAGE_PREFIX = 'coffee-companion'
export const SESSION_COOKIE_KEY = `${SESSION_STORAGE_PREFIX}_cookie`
export const SESSION_DATA_KEY = `${SESSION_STORAGE_PREFIX}_session_data`

// Sync get/set: the Expo client plugin reads the cookie on every request.
export const sessionStore = {
  getItem: (key: string) => SecureStore.getItem(key),
  setItem: (key: string, value: string) => {
    SecureStore.setItem(key, value)
  },
}

export async function clearSessionStore() {
  await Promise.all([
    SecureStore.deleteItemAsync(SESSION_COOKIE_KEY),
    SecureStore.deleteItemAsync(SESSION_DATA_KEY),
  ])
}
