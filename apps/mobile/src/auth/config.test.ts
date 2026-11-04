import { resolveApiBaseUrl } from './config'

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
