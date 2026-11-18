import { REQUEST_TIMEOUT_MS, createLiveEspressoApi } from './api'

jest.unmock('@trpc/client')
jest.mock('superjson', () => ({
  __esModule: true,
  default: {
    serialize: (json: unknown) => ({ json }),
    deserialize: ({ json }: { json: unknown }) => json,
  },
}))
const mockGetSessionCookie = jest.fn(() => Promise.resolve(''))
jest.mock('./auth/auth-client', () => ({
  getSessionCookie: () => mockGetSessionCookie(),
}))

describe('createLiveEspressoApi', () => {
  const realFetch = global.fetch

  beforeEach(() => {
    jest.useFakeTimers()
    global.fetch = jest.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new Error('Aborted')),
          )
        }),
    )
  })

  afterEach(() => {
    global.fetch = realFetch
    jest.useRealTimers()
  })

  it('rejects a save the server never answers', async () => {
    const saved = createLiveEspressoApi().create({
      idempotencyKey: 'key-1',
      coffeeId: 'coffee-1',
      grinderId: 'grinder-1',
      brewingDeviceId: 'device-1',
      roastDate: null,
      dose: '18',
      yield: '36',
      time: 28,
      grindSetting: '1.5',
      notes: null,
    })
    const outcome = jest.fn()
    saved.then(outcome, outcome)

    await jest.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1)
    expect(outcome).not.toHaveBeenCalled()
    await jest.advanceTimersByTimeAsync(1)
    await expect(saved).rejects.toThrow()
  })

  it('sends the stored session cookie once it resolves', async () => {
    mockGetSessionCookie.mockReturnValueOnce(
      Promise.resolve('better-auth.session_token=abc'),
    )
    void createLiveEspressoApi()
      .listShots()
      .catch(() => {})

    await jest.advanceTimersByTimeAsync(0)
    const init = jest.mocked(global.fetch).mock.calls[0]?.[1]
    expect(new Headers(init?.headers).get('cookie')).toBe(
      'better-auth.session_token=abc',
    )
  })
})
