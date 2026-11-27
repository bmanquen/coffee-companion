import {
  REQUEST_TIMEOUT_MS,
  createLiveCoffeesApi,
  createLiveEspressoApi,
} from './api'

jest.unmock('@trpc/client')
jest.mock('superjson', () => ({
  __esModule: true,
  default: {
    serialize: (json: unknown) => ({ json }),
    // Brings back the Dates superjson would, as JSON alone carries strings.
    deserialize: ({ json }: { json: unknown }) =>
      JSON.parse(JSON.stringify(json), (key, value) =>
        key === 'createdAt' ? new Date(value) : value,
      ),
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

describe('createLiveCoffeesApi', () => {
  const realFetch = global.fetch
  afterEach(() => {
    global.fetch = realFetch
  })

  const LINTONG = '00000000-0000-4000-8000-00000000000a'
  const OTHER = '00000000-0000-4000-8000-00000000000b'
  const at = (day: number) =>
    `2026-11-${String(day).padStart(2, '0')}T12:00:00.000Z`
  const brew = (id: string, coffeeId: string, day: number, extra = {}) => ({
    id,
    coffeeId,
    createdAt: at(day),
    sealed: false,
    isDialedIn: false,
    grindSetting: null,
    dose: null,
    ...extra,
  })
  const shotPages: Record<string, unknown> = {
    first: {
      items: [brew('shot-new', LINTONG, 20, { yield: '36', time: 30 })],
      total: 2,
      nextCursor: 'page-2',
    },
    'page-2': {
      items: [
        brew('shot-old', LINTONG, 2, { sealed: true, yield: null, time: null }),
      ],
      total: 2,
      nextCursor: null,
    },
  }
  const feeds: Record<string, unknown> = {
    'pouroverBrew.getAll': [
      brew('pour', LINTONG, 15, { water: '250', brewTime: 165 }),
      brew('pour-other', OTHER, 25, { water: '250', brewTime: 1 }),
    ],
    'aeropressBrew.getAll': [],
    'frenchpressBrew.getAll': [
      brew('press-other', OTHER, 26, { water: '1', steepTime: 1 }),
    ],
    'coldBrewBrew.getAll': [
      brew('cold', LINTONG, 10, { water: '1000', steepTime: 1080 }),
    ],
  }

  it("lists one Coffee's Brews of every method, newest first", async () => {
    const shotCoffeeIds: Array<unknown> = []
    global.fetch = jest.fn((url: RequestInfo | URL) => {
      const parsed = new URL(String(url))
      const paths = decodeURIComponent(
        parsed.pathname.split('/api/trpc/')[1],
      ).split(',')
      const inputs = JSON.parse(parsed.searchParams.get('input') ?? '{}')
      const results = paths.map((path, i) => {
        if (path !== 'espressoShot.getRecent') return feeds[path]
        const input = inputs[i].json
        shotCoffeeIds.push(input.coffeeId)
        return shotPages[input.cursor ?? 'first']
      })
      return Promise.resolve(
        new Response(
          JSON.stringify(
            results.map((data) => ({ result: { data: { json: data } } })),
          ),
          { headers: { 'content-type': 'application/json' } },
        ),
      )
    }) as typeof fetch

    const brews = await createLiveCoffeesApi().listBrews(LINTONG)

    expect(
      brews.map((b) => [b.id, b.method, b.output, b.time, b.sealed]),
    ).toEqual([
      ['shot-new', 'Espresso', '36', 30, false],
      ['pour', 'Pour Over', '250', 165, false],
      ['cold', 'Cold Brew', '1000', 1080, false],
      ['shot-old', 'Espresso', null, null, true],
    ])
    // Shots are asked for this Coffee only, page after page.
    expect(shotCoffeeIds).toEqual([LINTONG, LINTONG])
  })

  it("cancels a Coffee's Brew reads when its query is cancelled", async () => {
    const signals: Array<AbortSignal | null | undefined> = []
    global.fetch = jest.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      signals.push(init?.signal)
      return new Promise<Response>(() => {})
    }) as typeof fetch
    const controller = new AbortController()

    void createLiveCoffeesApi()
      .listBrews(LINTONG, controller.signal)
      .catch(() => {})
    // tRPC batches on a later tick, after reading the session cookie.
    for (let i = 0; i < 20 && signals.length === 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    controller.abort()

    expect(signals.length).toBeGreaterThan(0)
    expect(signals.every((signal) => signal?.aborted)).toBe(true)
  })
})
