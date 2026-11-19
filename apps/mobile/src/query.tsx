import {
  QueryClient,
  QueryClientProvider,
  focusManager,
  onlineManager,
} from '@tanstack/react-query'
import * as Network from 'expo-network'
import { useEffect, useState } from 'react'
import { AppState } from 'react-native'
import type { ReactNode } from 'react'

let lifecycleWired = false

export function wireReactNativeQueryLifecycle() {
  if (lifecycleWired) return
  lifecycleWired = true
  focusManager.setEventListener(subscribeAppFocus)
  onlineManager.setEventListener(subscribeNetworkOnline)
}

export function subscribeAppFocus(handleFocus: (focused: boolean) => void) {
  // The app may have come back to the foreground while no query listened,
  // such as after a sign-out in the background, so start from where it is.
  const current = AppState.currentState
  if (current !== 'unknown') handleFocus(current === 'active')
  const sub = AppState.addEventListener('change', (state) => {
    handleFocus(state === 'active')
  })
  return () => sub.remove()
}

export function subscribeNetworkOnline(setOnline: (online: boolean) => void) {
  let active = true
  let listenerDelivered = false
  const sub = Network.addNetworkStateListener((state) => {
    if (!active) return
    listenerDelivered = true
    setOnline(state.isConnected === true)
  })
  Network.getNetworkStateAsync().then(
    (state) => {
      if (!active || listenerDelivered) return
      setOnline(state.isConnected === true)
    },
    // The listener still delivers later changes.
    () => {},
  )
  return () => {
    active = false
    sub.remove()
  }
}

const isTest = process.env.NODE_ENV === 'test'

export function createMobileQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: isTest ? false : 1,
        staleTime: 30_000,
        gcTime: isTest ? 0 : undefined,
      },
      mutations: {
        // A paused save would leave the form busy until reconnect.
        networkMode: 'always',
        retry: false,
        gcTime: isTest ? 0 : undefined,
      },
    },
  })
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(createMobileQueryClient)
  useEffect(() => {
    if (isTest) return
    wireReactNativeQueryLifecycle()
  }, [])
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
