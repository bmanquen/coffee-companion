import { focusManager, onlineManager } from '@tanstack/react-query'
import * as Network from 'expo-network'
import { AppState } from 'react-native'
import { subscribeAppFocus, subscribeNetworkOnline } from './query'
import type { NetworkState } from 'expo-network'

function mockNetwork(probe: Promise<NetworkState>) {
  let listener: (state: NetworkState) => void = () => {}
  const remove = jest.fn()
  jest.mocked(Network.getNetworkStateAsync).mockReturnValue(probe)
  jest.mocked(Network.addNetworkStateListener).mockImplementation((callback) => {
    listener = callback
    return { remove }
  })
  return {
    deliver: (state: NetworkState) => listener(state),
    remove,
  }
}

describe('subscribeNetworkOnline', () => {
  afterEach(() => {
    onlineManager.setOnline(true)
    jest.mocked(Network.getNetworkStateAsync).mockReset()
    jest.mocked(Network.addNetworkStateListener).mockReset()
    jest.mocked(Network.getNetworkStateAsync).mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
    })
    jest.mocked(Network.addNetworkStateListener).mockReturnValue({
      remove: jest.fn(),
    })
  })

  it('stays online when a delayed probe reports offline after the listener reports online', async () => {
    let resolveProbe: (state: NetworkState) => void = () => {}
    const probe = new Promise<NetworkState>((resolve) => {
      resolveProbe = resolve
    })
    const network = mockNetwork(probe)

    onlineManager.setOnline(false)
    const stop = subscribeNetworkOnline((online) => {
      onlineManager.setOnline(online)
    })
    network.deliver({ isConnected: true })
    expect(onlineManager.isOnline()).toBe(true)

    resolveProbe({ isConnected: false })
    await probe
    expect(onlineManager.isOnline()).toBe(true)
    stop()
  })

  it('does not apply a probe that resolves after cleanup', async () => {
    let resolveProbe: (state: NetworkState) => void = () => {}
    const probe = new Promise<NetworkState>((resolve) => {
      resolveProbe = resolve
    })
    const network = mockNetwork(probe)
    const setOnline = jest.fn()

    const stop = subscribeNetworkOnline(setOnline)
    stop()
    expect(network.remove).toHaveBeenCalled()

    resolveProbe({ isConnected: false })
    await probe
    expect(setOnline).not.toHaveBeenCalled()
  })

  it('keeps the online state when the startup probe rejects', async () => {
    mockNetwork(Promise.reject(new Error('probe failed')))
    const setOnline = jest.fn()

    const stop = subscribeNetworkOnline(setOnline)
    await new Promise((resolve) => setImmediate(resolve))

    expect(setOnline).not.toHaveBeenCalled()
    stop()
  })
})

describe('subscribeAppFocus', () => {
  const setAppState = (state: string) => {
    Object.defineProperty(AppState, 'currentState', {
      configurable: true,
      get: () => state,
    })
  }

  afterEach(() => {
    focusManager.setFocused(undefined)
  })

  it('starts focused when the app returned to the foreground unobserved', () => {
    // Queries last saw the app go to the background, then stopped listening.
    focusManager.setFocused(false)
    setAppState('active')
    const stop = subscribeAppFocus((focused) => {
      focusManager.setFocused(focused)
    })
    expect(focusManager.isFocused()).toBe(true)
    stop()
  })

  it('starts unfocused in the background and leaves an unknown state alone', () => {
    const handleFocus = jest.fn()
    setAppState('background')
    subscribeAppFocus(handleFocus)()
    expect(handleFocus).toHaveBeenLastCalledWith(false)

    handleFocus.mockClear()
    setAppState('unknown')
    subscribeAppFocus(handleFocus)()
    expect(handleFocus).not.toHaveBeenCalled()
  })
})
