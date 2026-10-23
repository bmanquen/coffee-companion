import { createAuthClient } from 'better-auth/react'
import { expoClient } from '@better-auth/expo/client'
import { APP_SCHEME, apiBaseUrl } from './config'
import { SESSION_STORAGE_PREFIX, sessionStore } from './session-store'
import type { BetterAuthClientPlugin } from 'better-auth/client'

export const authClient = createAuthClient({
  baseURL: apiBaseUrl(),
  plugins: [
    // 1.6.26 types reject expoClient; runtime is fine. See better-auth#10571.
    expoClient({
      scheme: APP_SCHEME,
      storagePrefix: SESSION_STORAGE_PREFIX,
      storage: sessionStore,
    }) as BetterAuthClientPlugin,
  ],
})
