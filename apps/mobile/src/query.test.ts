import { onlineManager } from '@tanstack/react-query'
import * as Network from 'expo-network'
import type { NetworkState } from 'expo-network'
import { subscribeNetworkOnline } from './query'

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
})
