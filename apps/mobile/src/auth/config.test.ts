import {
  API_URL_DEV_TAG_PREFIX,
  FALLBACK_API_URL,
  apiUrlDevTag,
  configuredApiUrl,
  resolveApiBaseUrl,
} from './config'

describe('resolveApiBaseUrl', () => {
  it('rewrites localhost to the Android emulator alias in a dev build', () => {
    expect(
      resolveApiBaseUrl('http://localhost:3000/api', {
        os: 'android',
        isDev: true,
      }),
    ).toBe('http://10.0.2.2:3000/api')
    expect(
      resolveApiBaseUrl('http://127.0.0.1:3000', { os: 'android', isDev: true }),
    ).toBe('http://127.0.0.1:3000')
  })

  it('tags the configured URL so a stale Metro cache cannot hide behind extra.apiUrl', () => {
    expect(configuredApiUrl('http://127.0.0.1:3910')).toBe(
      'http://127.0.0.1:3910',
    )
    expect(configuredApiUrl(undefined)).toBe(FALLBACK_API_URL)
    expect(configuredApiUrl('')).toBe(FALLBACK_API_URL)
    expect(apiUrlDevTag('http://127.0.0.1:3910')).toBe(
      `${API_URL_DEV_TAG_PREFIX}http://127.0.0.1:3910`,
    )
  })

  it('keeps API_URL_DEV_TAG on the fallback when EXPO_PUBLIC_API_URL is empty', () => {
    const original = process.env.EXPO_PUBLIC_API_URL
    process.env.EXPO_PUBLIC_API_URL = ''
    jest.resetModules()
    try {
      const fresh = jest.requireActual('./config')
      expect(fresh.API_URL_DEV_TAG).toBe(
        `${fresh.API_URL_DEV_TAG_PREFIX}${fresh.FALLBACK_API_URL}`,
      )
      expect(fresh.configuredApiUrl()).toBe(fresh.FALLBACK_API_URL)
    } finally {
      if (original === undefined) delete process.env.EXPO_PUBLIC_API_URL
      else process.env.EXPO_PUBLIC_API_URL = original
      jest.resetModules()
    }
  })

  it('leaves ios, release, and non-loopback hosts unchanged', () => {
    expect(
      resolveApiBaseUrl('http://localhost:3000', { os: 'ios', isDev: true }),
    ).toBe('http://localhost:3000')
    expect(
      resolveApiBaseUrl('http://localhost:3000', { os: 'android', isDev: false }),
    ).toBe('http://localhost:3000')
    expect(
      resolveApiBaseUrl('https://api.example.com:443/v1', {
        os: 'android',
        isDev: true,
      }),
    ).toBe('https://api.example.com:443/v1')
  })
})
