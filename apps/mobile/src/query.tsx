import {
  QueryClient,
  QueryClientProvider,
  focusManager,
  notifyManager,
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
  focusManager.setEventListener((handleFocus) => {
    const sub = AppState.addEventListener('change', (state) => {
      handleFocus(state === 'active')
    })
    return () => sub.remove()
  })
  onlineManager.setEventListener(subscribeNetworkOnline)
}

export function subscribeNetworkOnline(setOnline: (online: boolean) => void) {
  let active = true
  let listenerDelivered = false
  const sub = Network.addNetworkStateListener((state) => {
    if (!active) return
    listenerDelivered = true
    setOnline(state.isConnected === true)
  })
  void Network.getNetworkStateAsync().then((state) => {
    if (!active || listenerDelivered) return
    setOnline(state.isConnected === true)
  })
  return () => {
    active = false
    sub.remove()
  }
}

const isTest = process.env.NODE_ENV === 'test'

if (isTest) {
  notifyManager.setScheduler((job) => {
    job()
  })
}

export function createMobileQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: isTest ? false : 1,
        staleTime: 30_000,
        gcTime: isTest ? 0 : undefined,
      },
      mutations: {
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
