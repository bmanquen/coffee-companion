import { SHOT_IDEMPOTENCY_DELETED } from '@coffee-companion/api/lib/espresso'
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFieldContext } from '@/hooks/form-context'
import { seedLatestUnsealed } from '@/test/espresso-shots'
import {
  makeBrewingDevice,
  makeCoffee,
  makeGrinder,
  makeRecentShot,
} from '@/test/factories'
import { createTestProviders } from '@/test/providers'
import {
  trpcErrorResponse,
  trpcStreamResponse,
  trpcSuccess,
} from '@/test/trpc-response'
import { Route } from './new'

const COFFEE = '00000000-0000-4000-8000-000000000001'
const COFFEE_B = '00000000-0000-4000-8000-000000000002'
const GRINDER = '00000000-0000-4000-8000-000000000003'
const GRINDER_B = '00000000-0000-4000-8000-000000000006'
const ESP_DEVICE = '00000000-0000-4000-8000-000000000005'
const AERO_DEVICE = '00000000-0000-4000-8000-000000000004'
const ts = new Date('2026-06-01T08:00:00.000Z')
const IDEMPOTENCY_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const mocks = vi.hoisted(() => ({ navigate: vi.fn(), track: vi.fn() }))

vi.mock('@/lib/analytics', () => ({ track: mocks.track }))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => ({
    options,
    useParams: () => mocks,
  }),
  useNavigate: () => mocks.navigate,
}))

vi.mock('@/components/form/search-select', () => ({
  SearchSelect: ({
    label,
    options,
  }: {
    label: string
    options: Array<{ value: string; label: string }>
  }) => {
    const field = useFieldContext<string>()
    return (
      <select
        aria-label={label}
        // The stored value, which a <select> hides behind its placeholder
        // when no option matches.
        data-field-value={field.state.value}
        value={field.state.value}
        onChange={(e) => field.handleChange(e.target.value)}
      >
        <option value="">Select {label}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    )
  },
}))

function seeded() {
  const providers = createTestProviders()
  const { queryClient: qc, trpc } = providers
  qc.setQueryData(trpc.coffee.getAll.queryKey(), [
    makeCoffee({ id: COFFEE, name: 'Ethiopia Guji' }),
    makeCoffee({ id: COFFEE_B, name: 'Colombia Huila' }),
  ])
  qc.setQueryData(trpc.grinder.list.queryKey(), [
    makeGrinder({ id: GRINDER, name: 'Niche Zero' }),
    makeGrinder({ id: GRINDER_B, name: 'P64' }),
  ])
  qc.setQueryData(trpc.brewingDevice.list.queryKey(), [
    makeBrewingDevice({
      id: ESP_DEVICE,
      name: 'Linea Mini',
      type: {
        id: 't2',
        userId: null,
        name: 'Espresso',
        nameKey: 'espresso',
        createdAt: ts,
        updatedAt: ts,
      },
    }),
    makeBrewingDevice({ id: AERO_DEVICE, name: 'AeroPress Go' }),
  ])
  seedLatestUnsealed(
    qc,
    trpc,
    COFFEE,
    makeRecentShot({
      id: 'shot-1',
      coffeeId: COFFEE,
      grinderId: GRINDER,
      brewingDeviceId: ESP_DEVICE,
      roastDate: '2026-05-01',
    }),
  )
  seedLatestUnsealed(
    qc,
    trpc,
    COFFEE_B,
    makeRecentShot({
      id: 'shot-b',
      coffeeId: COFFEE_B,
      grinderId: GRINDER_B,
      brewingDeviceId: ESP_DEVICE,
      roastDate: '2026-04-01',
    }),
  )
  qc.setQueryData(
    trpc.dialedInBrew.get.queryKey({
      coffeeId: COFFEE,
      brewingMethod: 'espresso',
      brewingDeviceId: ESP_DEVICE,
    }),
    [],
  )
  const fetchSpy = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(serveFromCache(providers))
  return { ...providers, fetchSpy }
}

const NewEspressoShot = Route.options.component!

function callText(call: Array<unknown>) {
  const url = String(call[0])
  const body = String((call[1] as RequestInit | undefined)?.body ?? '')
  return `${url}\n${body}`
}

function isCreateCall(call: Array<unknown>) {
  return callText(call).includes('espressoShot.create')
}

function isPrefillCall(call: Array<unknown>) {
  return callText(call).includes('getLatestUnsealed')
}

function coffeeIdFromCall(call: Array<unknown>) {
  return decodeURIComponent(callText(call)).match(
    /"coffeeId"\s*:\s*"([^"]+)"/,
  )?.[1]
}

// Answers every operation of a batched tRPC request in order: a Coffee's
// latest-shot lookup from the query cache, anything else with an empty
// result. httpBatchStreamLink can put the prefill and Dialed-in lookups in one
// request, so each needs its own slot in the reply.
function batchResponse(
  queryClient: ReturnType<typeof createTestProviders>['queryClient'],
  trpc: ReturnType<typeof createTestProviders>['trpc'],
  call: Array<unknown>,
) {
  const url = new URL(String(call[0]), 'http://localhost')
  const procedures = decodeURIComponent(
    url.pathname.split('/').pop() ?? '',
  ).split(',')
  const inputs = JSON.parse(url.searchParams.get('input') ?? '{}') as Record<
    string,
    { json?: { coffeeId?: string } } | undefined
  >
  const head = Object.fromEntries(
    procedures.map((procedure, index) => {
      const coffeeId = inputs[index]?.json?.coffeeId
      const data =
        procedure.endsWith('getLatestUnsealed') && coffeeId
          ? (queryClient.getQueryData(
              trpc.espressoShot.getLatestUnsealed.queryKey({ coffeeId }),
            ) ?? null)
          : procedure.endsWith('getLatestUnsealed')
            ? null
            : {}
      return [String(index), [[{ result: { data } }]]]
    }),
  )
  return trpcStreamResponse(head)
}

function serveFromCache(
  providers: ReturnType<typeof createTestProviders>,
  create?: (call: Array<unknown>) => Promise<Response> | Response,
) {
  return async (...call: Array<unknown>) => {
    if (isCreateCall(call)) return create ? create(call) : trpcSuccess()
    return batchResponse(providers.queryClient, providers.trpc, call)
  }
}

function createCalls(fetchSpy: { mock: { calls: Array<Array<unknown>> } }) {
  return fetchSpy.mock.calls.filter((call) => isCreateCall(call))
}

// Each create request's input, in order, as the API receives it.
function createInputs(fetchSpy: { mock: { calls: Array<Array<unknown>> } }) {
  return createCalls(fetchSpy).map((call) => {
    const body = JSON.parse(
      String((call[1] as RequestInit | undefined)?.body ?? '{}'),
    ) as Record<string, { json: Record<string, unknown> }>
    return body['0'].json
  })
}

function createKeys(fetchSpy: { mock: { calls: Array<Array<unknown>> } }) {
  return createInputs(fetchSpy).map((input) => input.idempotencyKey)
}

function prefillCalls(fetchSpy: { mock: { calls: Array<Array<unknown>> } }) {
  return fetchSpy.mock.calls.filter((call) => isPrefillCall(call))
}

describe('NewEspressoShot form', () => {
  beforeEach(() => {
    mocks.track.mockClear()
    mocks.navigate.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('offers only Espresso-type brewing devices', () => {
    const { Wrapper } = seeded()
    render(<NewEspressoShot />, { wrapper: Wrapper })

    const deviceSelect = screen.getByRole('combobox', {
      name: 'Brewing Device',
    })
    expect(
      within(deviceSelect).getByRole('option', { name: 'Linea Mini' }),
    ).toBeTruthy()
    expect(
      within(deviceSelect).queryByRole('option', { name: 'AeroPress Go' }),
    ).toBeNull()
  })

  it('leaves brewing device blank when the last shot was not espresso', async () => {
    const providers = seeded()
    const { queryClient, trpc, Wrapper } = providers
    seedLatestUnsealed(
      queryClient,
      trpc,
      COFFEE,
      makeRecentShot({
        id: 'shot-1',
        coffeeId: COFFEE,
        grinderId: GRINDER,
        brewingDeviceId: AERO_DEVICE,
        roastDate: '2026-05-01',
      }),
    )
    render(<NewEspressoShot />, { wrapper: Wrapper })

    fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
      target: { value: COFFEE },
    })

    expect(await screen.findByText('May 1st, 2026')).toBeTruthy()
    expect(screen.getByDisplayValue('Niche Zero')).toBeTruthy()
    expect(
      screen
        .getByRole('combobox', { name: 'Brewing Device' })
        .getAttribute('data-field-value'),
    ).toBe('')
  })

  it('does not submit a prefilled grinder that is not in the list', async () => {
    const { queryClient, trpc, Wrapper, fetchSpy } = seeded()
    try {
      seedLatestUnsealed(
        queryClient,
        trpc,
        COFFEE,
        makeRecentShot({
          id: 'shot-1',
          coffeeId: COFFEE,
          grinderId: '00000000-0000-4000-8000-0000000000ff',
          brewingDeviceId: ESP_DEVICE,
          roastDate: '2026-05-01',
        }),
      )
      render(<NewEspressoShot />, { wrapper: Wrapper })

      fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
        target: { value: COFFEE },
      })
      expect(await screen.findByText('May 1st, 2026')).toBeTruthy()
      fireEvent.change(screen.getByLabelText(/^Dose/), {
        target: { value: '18' },
      })
      fireEvent.change(screen.getByLabelText(/^Yield/), {
        target: { value: '36' },
      })
      fireEvent.change(screen.getByLabelText(/^Time/), {
        target: { value: '30' },
      })
      fireEvent.change(screen.getByLabelText(/^Grind Setting/), {
        target: { value: '1.5' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Log' }))
      await act(async () => {})

      fireEvent.change(screen.getByRole('combobox', { name: 'Grinder' }), {
        target: { value: GRINDER },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Log' }))

      await waitFor(() => expect(createCalls(fetchSpy).length).toBeGreaterThan(0))
      expect(createCalls(fetchSpy)).toHaveLength(1)
      expect(createInputs(fetchSpy)[0].grinderId).toBe(GRINDER)
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('surfaces the Dialed-in Brew for the prefilled device', async () => {
    const { queryClient, trpc, Wrapper } = seeded()
    queryClient.setQueryData(
      trpc.dialedInBrew.get.queryKey({
        coffeeId: COFFEE,
        brewingMethod: 'espresso',
        brewingDeviceId: ESP_DEVICE,
      }),
      [
        {
          coffeeId: COFFEE,
          brewingMethod: 'espresso',
          brewingDeviceId: ESP_DEVICE,
          brewId: 'shot-1',
          coffeeName: 'Ethiopia Guji',
          deviceName: 'Linea Mini',
          grindSetting: '21',
          dose: '18',
          outputGrams: '36',
          outputLabel: 'Yield',
          time: 27,
          timeUnit: 's',
          sealed: false,
        },
      ],
    )
    render(<NewEspressoShot />, { wrapper: Wrapper })

    fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
      target: { value: COFFEE },
    })

    expect(
      await screen.findByRole('status', { name: 'Dialed-in for Linea Mini' }),
    ).toBeTruthy()
    expect(
      screen.getByText(
        'Ethiopia Guji · Grind 21 · Dose 18g · Yield 36g · Ratio 1:2 · Time 27s',
      ),
    ).toBeTruthy()
  })

  it('prefills grinder and device from the coffee’s latest shot', async () => {
    const { Wrapper } = seeded()
    render(<NewEspressoShot />, { wrapper: Wrapper })

    fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
      target: { value: COFFEE },
    })

    expect(await screen.findByDisplayValue('Niche Zero')).toBeTruthy()
    expect(screen.getByDisplayValue('Linea Mini')).toBeTruthy()
  })

  it('auto-fills roast date as the same calendar day', async () => {
    const { Wrapper } = seeded()
    render(<NewEspressoShot />, { wrapper: Wrapper })

    fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
      target: { value: COFFEE },
    })

    expect(await screen.findByText('May 1st, 2026')).toBeTruthy()
    expect(screen.queryByText('April 30th, 2026')).toBeNull()
  })

  it('submits a create with the entered dose and yield', async () => {
    const { Wrapper, fetchSpy } = seeded()
    try {
      render(<NewEspressoShot />, { wrapper: Wrapper })

      fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
        target: { value: COFFEE },
      })
      expect(await screen.findByDisplayValue('Niche Zero')).toBeTruthy()
      fireEvent.change(screen.getByLabelText(/^Dose/), {
        target: { value: '18' },
      })
      fireEvent.change(screen.getByLabelText(/^Yield/), {
        target: { value: '36' },
      })
      fireEvent.change(screen.getByLabelText(/^Time/), {
        target: { value: '30' },
      })
      fireEvent.change(screen.getByLabelText(/^Grind Setting/), {
        target: { value: '1.5' },
      })

      fireEvent.click(screen.getByRole('button', { name: 'Log' }))

      await waitFor(() => expect(createCalls(fetchSpy).length).toBe(1))
      const createCall = createCalls(fetchSpy)[0]
      expect(String(createCall[0])).toContain('espressoShot.create')
      expect(createInputs(fetchSpy)[0]).toMatchObject({
        dose: '18',
        yield: '36',
        coffeeId: COFFEE,
        // The calendar day, not a timestamp a time zone could shift.
        roastDate: '2026-05-01',
      })
      // Navigation waits for the shot reads to refresh after tracking.
      await waitFor(() =>
        expect(mocks.navigate).toHaveBeenCalledWith({
          to: '/brews',
          search: { method: 'espresso' },
        }),
      )
      expect(mocks.track).toHaveBeenCalledTimes(1)
      expect(mocks.track).toHaveBeenCalledWith('brew_logged', {
        method: 'espresso',
      })
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('sends no second create between a successful save and Brews opening', async () => {
    const providers = seeded()
    const { Wrapper, fetchSpy } = providers
    fetchSpy.mockImplementation(serveFromCache(providers))
    try {
      render(<NewEspressoShot />, { wrapper: Wrapper })
      fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
        target: { value: COFFEE },
      })
      expect(await screen.findByDisplayValue('Niche Zero')).toBeTruthy()
      fireEvent.change(screen.getByLabelText(/^Dose/), {
        target: { value: '18' },
      })
      fireEvent.change(screen.getByLabelText(/^Yield/), {
        target: { value: '36' },
      })
      fireEvent.change(screen.getByLabelText(/^Time/), {
        target: { value: '30' },
      })
      fireEvent.change(screen.getByLabelText(/^Grind Setting/), {
        target: { value: '1.5' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Log' }))
      // navigate is mocked, so the form stays up as it would until Brews
      // renders.
      await waitFor(() => expect(mocks.navigate).toHaveBeenCalled())
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /Log/ })).toHaveProperty(
          'disabled',
          true,
        ),
      )

      // Enter submits the form even past the button.
      fireEvent.submit(
        screen.getByRole('button', { name: /Log/ }).closest('form')!,
      )
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50))
      })
      expect(createCalls(fetchSpy)).toHaveLength(1)
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('does not go to Brews when the create lands after the form closed', async () => {
    const providers = seeded()
    const { queryClient, Wrapper, fetchSpy } = providers
    let answer: (response: Response) => void = () => {}
    fetchSpy.mockImplementation(
      serveFromCache(
        providers,
        () =>
          new Promise<Response>((resolve) => {
            answer = resolve
          }),
      ),
    )
    try {
      const { unmount } = render(<NewEspressoShot />, { wrapper: Wrapper })
      fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
        target: { value: COFFEE },
      })
      expect(await screen.findByDisplayValue('Niche Zero')).toBeTruthy()
      fireEvent.change(screen.getByLabelText(/^Dose/), {
        target: { value: '18' },
      })
      fireEvent.change(screen.getByLabelText(/^Yield/), {
        target: { value: '36' },
      })
      fireEvent.change(screen.getByLabelText(/^Time/), {
        target: { value: '30' },
      })
      fireEvent.change(screen.getByLabelText(/^Grind Setting/), {
        target: { value: '1.5' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Log' }))
      await waitFor(() => expect(createCalls(fetchSpy).length).toBe(1))

      unmount()
      await act(async () => {
        answer(trpcSuccess())
      })
      // onSuccess has run once the mutation reads as succeeded.
      await waitFor(() =>
        expect(
          queryClient
            .getMutationCache()
            .getAll()
            .map((mutation) => mutation.state.status),
        ).toContain('success'),
      )
      expect(mocks.navigate).not.toHaveBeenCalled()
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('retries a lost create with the same idempotency key', async () => {
    const providers = seeded()
    const { Wrapper, fetchSpy } = providers
    let creates = 0
    fetchSpy.mockImplementation(
      serveFromCache(providers, () => {
        creates += 1
        if (creates === 1) throw new Error('Network request failed')
        return trpcSuccess()
      }),
    )
    try {
      render(<NewEspressoShot />, { wrapper: Wrapper })

      fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
        target: { value: COFFEE },
      })
      expect(await screen.findByDisplayValue('Niche Zero')).toBeTruthy()
      fireEvent.change(screen.getByLabelText(/^Dose/), {
        target: { value: '18' },
      })
      fireEvent.change(screen.getByLabelText(/^Yield/), {
        target: { value: '36' },
      })
      fireEvent.change(screen.getByLabelText(/^Time/), {
        target: { value: '30' },
      })
      fireEvent.change(screen.getByLabelText(/^Grind Setting/), {
        target: { value: '1.5' },
      })

      fireEvent.click(screen.getByRole('button', { name: 'Log' }))
      await waitFor(() => expect(createCalls(fetchSpy).length).toBe(1))
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Log' })).toHaveProperty(
          'disabled',
          false,
        ),
      )

      fireEvent.click(screen.getByRole('button', { name: 'Log' }))
      await waitFor(() => expect(createCalls(fetchSpy).length).toBe(2))

      const keys = createKeys(fetchSpy)
      expect(keys[0]).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      )
      expect(keys[0]).toBe(keys[1])
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('mints a new key once the API says the replayed shot was deleted', async () => {
    const providers = seeded()
    const { Wrapper, fetchSpy } = providers
    let creates = 0
    fetchSpy.mockImplementation(
      serveFromCache(providers, () => {
        creates += 1
        if (creates === 1) throw new Error('Network request failed')
        if (creates === 2) {
          return trpcErrorResponse('CONFLICT', SHOT_IDEMPOTENCY_DELETED)
        }
        return trpcSuccess()
      }),
    )
    try {
      render(<NewEspressoShot />, { wrapper: Wrapper })

      fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
        target: { value: COFFEE },
      })
      expect(await screen.findByDisplayValue('Niche Zero')).toBeTruthy()
      fireEvent.change(screen.getByLabelText(/^Dose/), {
        target: { value: '18' },
      })
      fireEvent.change(screen.getByLabelText(/^Yield/), {
        target: { value: '36' },
      })
      fireEvent.change(screen.getByLabelText(/^Time/), {
        target: { value: '30' },
      })
      fireEvent.change(screen.getByLabelText(/^Grind Setting/), {
        target: { value: '1.5' },
      })

      const log = async (calls: number) => {
        await waitFor(() =>
          expect(screen.getByRole('button', { name: 'Log' })).toHaveProperty(
            'disabled',
            false,
          ),
        )
        fireEvent.click(screen.getByRole('button', { name: 'Log' }))
        await waitFor(() => expect(createCalls(fetchSpy).length).toBe(calls))
      }
      await log(1)
      await log(2)
      await log(3)

      const keys = createKeys(fetchSpy)
      for (const key of keys) expect(key).toMatch(IDEMPOTENCY_KEY_PATTERN)
      // The lost save replays under its key until the API says it is gone.
      expect(keys[1]).toBe(keys[0])
      expect(keys[2]).not.toBe(keys[0])
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it.each([
    {
      reply: 'a replay conflict',
      second: () =>
        trpcErrorResponse('CONFLICT', 'This key was used for another shot.'),
    },
    {
      reply: 'the deleted-key message without its CONFLICT code',
      second: () => {
        throw new Error(SHOT_IDEMPOTENCY_DELETED)
      },
    },
    {
      reply: 'the deleted-key message under another code',
      second: () => trpcErrorResponse('BAD_REQUEST', SHOT_IDEMPOTENCY_DELETED),
    },
  ])("keeps the lost save's key after $reply", async ({ second }) => {
    const providers = seeded()
    const { Wrapper, fetchSpy } = providers
    let creates = 0
    fetchSpy.mockImplementation(
      serveFromCache(providers, () => {
        creates += 1
        if (creates === 1) throw new Error('Network request failed')
        if (creates === 2) return second()
        return trpcSuccess()
      }),
    )
    try {
      render(<NewEspressoShot />, { wrapper: Wrapper })

      fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
        target: { value: COFFEE },
      })
      expect(await screen.findByDisplayValue('Niche Zero')).toBeTruthy()
      fireEvent.change(screen.getByLabelText(/^Dose/), {
        target: { value: '18' },
      })
      fireEvent.change(screen.getByLabelText(/^Yield/), {
        target: { value: '36' },
      })
      fireEvent.change(screen.getByLabelText(/^Time/), {
        target: { value: '30' },
      })
      fireEvent.change(screen.getByLabelText(/^Grind Setting/), {
        target: { value: '1.5' },
      })

      const log = async (calls: number) => {
        await waitFor(() =>
          expect(screen.getByRole('button', { name: 'Log' })).toHaveProperty(
            'disabled',
            false,
          ),
        )
        fireEvent.click(screen.getByRole('button', { name: 'Log' }))
        await waitFor(() => expect(createCalls(fetchSpy).length).toBe(calls))
      }
      await log(1)
      await log(2)
      await log(3)

      const keys = createKeys(fetchSpy)
      // Only a CONFLICT that says the shot was deleted frees the key; a new
      // key here could store the lost save a second time.
      for (const key of keys) expect(key).toMatch(IDEMPOTENCY_KEY_PATTERN)
      expect(keys[1]).toBe(keys[0])
      expect(keys[2]).toBe(keys[0])
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('mints a new key when the draft changes after a failed save', async () => {
    const providers = seeded()
    const { Wrapper, fetchSpy } = providers
    let creates = 0
    fetchSpy.mockImplementation(
      serveFromCache(providers, () => {
        creates += 1
        if (creates === 1) throw new Error('Network request failed')
        return trpcSuccess({ id: 'shot-new', dose: '22' })
      }),
    )
    try {
      render(<NewEspressoShot />, { wrapper: Wrapper })

      fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
        target: { value: COFFEE },
      })
      expect(await screen.findByDisplayValue('Niche Zero')).toBeTruthy()
      fireEvent.change(screen.getByLabelText(/^Dose/), {
        target: { value: '18' },
      })
      fireEvent.change(screen.getByLabelText(/^Yield/), {
        target: { value: '36' },
      })
      fireEvent.change(screen.getByLabelText(/^Time/), {
        target: { value: '30' },
      })
      fireEvent.change(screen.getByLabelText(/^Grind Setting/), {
        target: { value: '1.5' },
      })

      fireEvent.click(screen.getByRole('button', { name: 'Log' }))
      await waitFor(() => expect(createCalls(fetchSpy).length).toBe(1))
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Log' })).toHaveProperty(
          'disabled',
          false,
        ),
      )

      fireEvent.change(screen.getByLabelText(/^Dose/), {
        target: { value: '22' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Log' }))
      await waitFor(() => expect(createCalls(fetchSpy).length).toBe(2))

      const keys = createKeys(fetchSpy)
      expect(keys[0]).toMatch(IDEMPOTENCY_KEY_PATTERN)
      expect(keys[1]).toMatch(IDEMPOTENCY_KEY_PATTERN)
      expect(keys[0]).not.toBe(keys[1])
      expect(createInputs(fetchSpy)[1].dose).toBe('22')
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('reuses the first key when a failed draft is edited back to it', async () => {
    const providers = seeded()
    const { Wrapper, fetchSpy } = providers
    let creates = 0
    fetchSpy.mockImplementation(
      serveFromCache(providers, () => {
        creates += 1
        if (creates < 3) throw new Error('Network request failed')
        return trpcSuccess({ id: 'shot-new', dose: '18' })
      }),
    )
    try {
      render(<NewEspressoShot />, { wrapper: Wrapper })

      fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
        target: { value: COFFEE },
      })
      expect(await screen.findByDisplayValue('Niche Zero')).toBeTruthy()
      fireEvent.change(screen.getByLabelText(/^Yield/), {
        target: { value: '36' },
      })
      fireEvent.change(screen.getByLabelText(/^Time/), {
        target: { value: '30' },
      })
      fireEvent.change(screen.getByLabelText(/^Grind Setting/), {
        target: { value: '1.5' },
      })

      // Waits for Log before each press: after the last, successful save
      // it stays off until Brews opens.
      const logWithDose = async (dose: string, count: number) => {
        await waitFor(() =>
          expect(screen.getByRole('button', { name: 'Log' })).toHaveProperty(
            'disabled',
            false,
          ),
        )
        fireEvent.change(screen.getByLabelText(/^Dose/), {
          target: { value: dose },
        })
        fireEvent.click(screen.getByRole('button', { name: 'Log' }))
        await waitFor(() => expect(createCalls(fetchSpy).length).toBe(count))
      }
      await logWithDose('18', 1)
      await logWithDose('22', 2)
      await logWithDose('18', 3)

      const keys = createKeys(fetchSpy)
      for (const key of keys) expect(key).toMatch(IDEMPOTENCY_KEY_PATTERN)
      expect(keys[0]).not.toBe(keys[1])
      expect(keys[2]).toBe(keys[0])
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('clears the previous coffee’s roast date as soon as another coffee is chosen', async () => {
    const { Wrapper } = seeded()
    render(<NewEspressoShot />, { wrapper: Wrapper })

    fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
      target: { value: COFFEE },
    })
    expect(await screen.findByText('May 1st, 2026')).toBeTruthy()

    fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
      target: { value: COFFEE_B },
    })
    expect(screen.queryByText('May 1st, 2026')).toBeNull()
    expect(await screen.findByText('April 1st, 2026')).toBeTruthy()
  })

  it('keeps a grinder chosen while prefill is still loading', async () => {
    const providers = seeded()
    const { queryClient, trpc, Wrapper } = providers
    queryClient.removeQueries({
      queryKey: trpc.espressoShot.getLatestUnsealed.queryKey({
        coffeeId: COFFEE,
      }),
    })
    let resolvePrefill: (
      shot: ReturnType<typeof makeRecentShot>,
    ) => void = () => {}
    const pending = new Promise<ReturnType<typeof makeRecentShot>>(
      (resolve) => {
        resolvePrefill = resolve
      },
    )
    void queryClient.prefetchQuery({
      ...trpc.espressoShot.getLatestUnsealed.queryOptions({ coffeeId: COFFEE }),
      queryFn: () => pending,
    })
    render(<NewEspressoShot />, { wrapper: Wrapper })

    fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
      target: { value: COFFEE },
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'Grinder' }), {
      target: { value: GRINDER_B },
    })
    expect(screen.getByDisplayValue('P64')).toBeTruthy()

    resolvePrefill(
      makeRecentShot({
        id: 'shot-1',
        coffeeId: COFFEE,
        grinderId: GRINDER,
        brewingDeviceId: ESP_DEVICE,
        roastDate: '2026-05-01',
      }),
    )
    expect(await screen.findByText('May 1st, 2026')).toBeTruthy()
    expect(screen.getByDisplayValue('P64')).toBeTruthy()
    expect(screen.queryByDisplayValue('Niche Zero')).toBeNull()
  })

  it('checks prefilled gear against the lists as they are when the lookup lands', async () => {
    const providers = seeded()
    const { queryClient, trpc, Wrapper } = providers
    queryClient.removeQueries({
      queryKey: trpc.espressoShot.getLatestUnsealed.queryKey({
        coffeeId: COFFEE,
      }),
    })
    let resolvePrefill: (
      shot: ReturnType<typeof makeRecentShot>,
    ) => void = () => {}
    const pending = new Promise<ReturnType<typeof makeRecentShot>>(
      (resolve) => {
        resolvePrefill = resolve
      },
    )
    void queryClient.prefetchQuery({
      ...trpc.espressoShot.getLatestUnsealed.queryOptions({ coffeeId: COFFEE }),
      queryFn: () => pending,
    })
    render(<NewEspressoShot />, { wrapper: Wrapper })
    fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
      target: { value: COFFEE },
    })

    // While the lookup is out, the grinder is deleted and the Linea Mini
    // retyped as an AeroPress, so neither is in its picker any more.
    await act(async () => {
      queryClient.setQueryData(trpc.grinder.list.queryKey(), [
        makeGrinder({ id: GRINDER_B, name: 'P64' }),
      ])
      queryClient.setQueryData(trpc.brewingDevice.list.queryKey(), [
        makeBrewingDevice({ id: ESP_DEVICE, name: 'Linea Mini' }),
        makeBrewingDevice({ id: AERO_DEVICE, name: 'AeroPress Go' }),
      ])
    })
    resolvePrefill(
      makeRecentShot({
        id: 'shot-1',
        coffeeId: COFFEE,
        grinderId: GRINDER,
        brewingDeviceId: ESP_DEVICE,
        roastDate: '2026-05-01',
      }),
    )
    expect(await screen.findByText('May 1st, 2026')).toBeTruthy()
    expect(
      screen
        .getByRole('combobox', { name: 'Grinder' })
        .getAttribute('data-field-value'),
    ).toBe('')
    expect(
      screen
        .getByRole('combobox', { name: 'Brewing Device' })
        .getAttribute('data-field-value'),
    ).toBe('')
  })

  it('prefills roast date and device when the latest shot has no grinder', async () => {
    const { queryClient, trpc, Wrapper } = seeded()
    seedLatestUnsealed(
      queryClient,
      trpc,
      COFFEE,
      makeRecentShot({
        id: 'shot-1',
        coffeeId: COFFEE,
        grinderId: null,
        grinder: null,
        brewingDeviceId: ESP_DEVICE,
        roastDate: '2026-05-01',
      }),
    )
    render(<NewEspressoShot />, { wrapper: Wrapper })

    fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
      target: { value: COFFEE },
    })

    expect(await screen.findByText('May 1st, 2026')).toBeTruthy()
    expect(screen.getByDisplayValue('Linea Mini')).toBeTruthy()
    expect(screen.queryByDisplayValue('Niche Zero')).toBeNull()
  })

  it('does not apply prefill after a save has started', async () => {
    const providers = seeded()
    const { queryClient, trpc, Wrapper, fetchSpy } = providers
    let creates = 0
    fetchSpy.mockImplementation(
      serveFromCache(providers, () => {
        creates += 1
        if (creates === 1) throw new Error('Network request failed')
        return trpcSuccess()
      }),
    )
    try {
      queryClient.removeQueries({
        queryKey: trpc.espressoShot.getLatestUnsealed.queryKey({
          coffeeId: COFFEE,
        }),
      })
      let resolvePrefill: (
        shot: ReturnType<typeof makeRecentShot>,
      ) => void = () => {}
      const pending = new Promise<ReturnType<typeof makeRecentShot>>(
        (resolve) => {
          resolvePrefill = resolve
        },
      )
      void queryClient.prefetchQuery({
        ...trpc.espressoShot.getLatestUnsealed.queryOptions({
          coffeeId: COFFEE,
        }),
        queryFn: () => pending,
      })
      render(<NewEspressoShot />, { wrapper: Wrapper })

      fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
        target: { value: COFFEE },
      })
      fireEvent.change(screen.getByRole('combobox', { name: 'Grinder' }), {
        target: { value: GRINDER },
      })
      fireEvent.change(
        screen.getByRole('combobox', { name: 'Brewing Device' }),
        {
          target: { value: ESP_DEVICE },
        },
      )
      fireEvent.change(screen.getByLabelText(/^Dose/), {
        target: { value: '18' },
      })
      fireEvent.change(screen.getByLabelText(/^Yield/), {
        target: { value: '36' },
      })
      fireEvent.change(screen.getByLabelText(/^Time/), {
        target: { value: '30' },
      })
      fireEvent.change(screen.getByLabelText(/^Grind Setting/), {
        target: { value: '1.5' },
      })

      fireEvent.click(screen.getByRole('button', { name: 'Log' }))
      await waitFor(() => expect(createCalls(fetchSpy).length).toBe(1))
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Log' })).toHaveProperty(
          'disabled',
          false,
        ),
      )

      resolvePrefill(
        makeRecentShot({
          id: 'shot-1',
          coffeeId: COFFEE,
          grinderId: GRINDER,
          brewingDeviceId: ESP_DEVICE,
          roastDate: '2026-05-01',
        }),
      )
      await act(async () => {
        await pending
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
      expect(screen.queryByText('May 1st, 2026')).toBeNull()

      fireEvent.click(screen.getByRole('button', { name: 'Log' }))
      await waitFor(() => expect(createCalls(fetchSpy).length).toBe(2))
      const keys = createKeys(fetchSpy)
      for (const key of keys) expect(key).toMatch(IDEMPOTENCY_KEY_PATTERN)
      expect(keys[0]).toBe(keys[1])
      // The retry sends exactly what the lost save sent.
      expect(createInputs(fetchSpy)[1]).toEqual(createInputs(fetchSpy)[0])
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('does not apply a prefill that lands while Log is validating', async () => {
    const providers = seeded()
    const { queryClient, trpc, Wrapper, fetchSpy } = providers
    let creates = 0
    fetchSpy.mockImplementation(
      serveFromCache(providers, () => {
        creates += 1
        if (creates === 1) throw new Error('Network request failed')
        return trpcSuccess()
      }),
    )
    try {
      queryClient.removeQueries({
        queryKey: trpc.espressoShot.getLatestUnsealed.queryKey({
          coffeeId: COFFEE,
        }),
      })
      let resolvePrefill: (
        shot: ReturnType<typeof makeRecentShot>,
      ) => void = () => {}
      const pending = new Promise<ReturnType<typeof makeRecentShot>>(
        (resolve) => {
          resolvePrefill = resolve
        },
      )
      void queryClient.prefetchQuery({
        ...trpc.espressoShot.getLatestUnsealed.queryOptions({
          coffeeId: COFFEE,
        }),
        queryFn: () => pending,
      })
      render(<NewEspressoShot />, { wrapper: Wrapper })

      fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
        target: { value: COFFEE },
      })
      fireEvent.change(screen.getByRole('combobox', { name: 'Grinder' }), {
        target: { value: GRINDER },
      })
      fireEvent.change(
        screen.getByRole('combobox', { name: 'Brewing Device' }),
        {
          target: { value: ESP_DEVICE },
        },
      )
      fireEvent.change(screen.getByLabelText(/^Dose/), {
        target: { value: '18' },
      })
      fireEvent.change(screen.getByLabelText(/^Yield/), {
        target: { value: '36' },
      })
      fireEvent.change(screen.getByLabelText(/^Time/), {
        target: { value: '30' },
      })
      fireEvent.change(screen.getByLabelText(/^Grind Setting/), {
        target: { value: '1.5' },
      })

      // The lookup's answer is already on its way when Log is pressed, so it
      // lands after the click and before the save is sent.
      resolvePrefill(
        makeRecentShot({
          id: 'shot-1',
          coffeeId: COFFEE,
          grinderId: GRINDER,
          brewingDeviceId: ESP_DEVICE,
          roastDate: '2026-05-01',
        }),
      )
      fireEvent.click(screen.getByRole('button', { name: 'Log' }))
      await waitFor(() => expect(createCalls(fetchSpy).length).toBe(1))
      expect(createInputs(fetchSpy)[0].roastDate ?? null).toBeNull()
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('retries a lost save unchanged when Try again would prefill a newer shot', async () => {
    const providers = seeded()
    const { queryClient, trpc, Wrapper, fetchSpy } = providers
    queryClient.removeQueries({
      queryKey: trpc.espressoShot.getLatestUnsealed.queryKey({
        coffeeId: COFFEE,
      }),
    })
    let lookups = 0
    fetchSpy.mockImplementation(async (...call: Array<unknown>) => {
      if (isPrefillCall(call)) {
        lookups += 1
        if (lookups === 1) throw new Error('Network request failed')
        return trpcSuccess(
          makeRecentShot({
            id: 'shot-1',
            coffeeId: COFFEE,
            grinderId: GRINDER,
            brewingDeviceId: ESP_DEVICE,
            roastDate: '2026-05-01',
          }),
        )
      }
      if (isCreateCall(call)) throw new Error('Network request failed')
      return trpcSuccess()
    })
    try {
      render(<NewEspressoShot />, { wrapper: Wrapper })
      fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
        target: { value: COFFEE },
      })
      expect(
        await screen.findByRole('button', { name: 'Try again' }),
      ).toBeTruthy()
      expect(prefillCalls(fetchSpy)).toHaveLength(1)

      fireEvent.change(screen.getByRole('combobox', { name: 'Grinder' }), {
        target: { value: GRINDER },
      })
      fireEvent.change(
        screen.getByRole('combobox', { name: 'Brewing Device' }),
        {
          target: { value: ESP_DEVICE },
        },
      )
      fireEvent.change(screen.getByLabelText(/^Dose/), {
        target: { value: '18' },
      })
      fireEvent.change(screen.getByLabelText(/^Yield/), {
        target: { value: '36' },
      })
      fireEvent.change(screen.getByLabelText(/^Time/), {
        target: { value: '30' },
      })
      fireEvent.change(screen.getByLabelText(/^Grind Setting/), {
        target: { value: '1.5' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Log' }))
      await waitFor(() => expect(createCalls(fetchSpy).length).toBe(1))
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Log' })).toHaveProperty(
          'disabled',
          false,
        ),
      )

      // The save may have committed, so the retry must send what it sent.
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
      await waitFor(() =>
        expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull(),
      )
      // Let tRPC dispatch any lookup Try again queued before counting.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
      expect(lookups).toBe(1)
      expect(screen.queryByText('May 1st, 2026')).toBeNull()

      fireEvent.click(screen.getByRole('button', { name: 'Log' }))
      await waitFor(() => expect(createCalls(fetchSpy).length).toBe(2))
      const bodies = createCalls(fetchSpy).map((call) =>
        String((call[1] as RequestInit | undefined)?.body ?? ''),
      )
      expect(bodies[0]).toContain('idempotencyKey')
      expect(bodies[1]).toBe(bodies[0])
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('restores a lost save, not a lookup started before it, when its coffee is reselected', async () => {
    const { Wrapper, fetchSpy } = seeded()
    let resolveFirstLookup: (response: Response) => void = () => {}
    const firstLookup = new Promise<Response>((resolve) => {
      resolveFirstLookup = resolve
    })
    fetchSpy.mockImplementation(async (...call: Array<unknown>) => {
      if (isPrefillCall(call)) {
        if (coffeeIdFromCall(call) !== COFFEE) return trpcSuccess(null)
        return firstLookup
      }
      if (isCreateCall(call)) throw new Error('Network request failed')
      return trpcSuccess()
    })
    const pickCoffee = (id: string) =>
      fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
        target: { value: id },
      })
    const logAndSettle = async (count: number) => {
      fireEvent.click(screen.getByRole('button', { name: 'Log' }))
      await waitFor(() => expect(createCalls(fetchSpy).length).toBe(count))
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Log' })).toHaveProperty(
          'disabled',
          false,
        ),
      )
    }
    try {
      render(<NewEspressoShot />, { wrapper: Wrapper })
      pickCoffee(COFFEE)
      await waitFor(() => expect(prefillCalls(fetchSpy)).toHaveLength(1))
      fireEvent.change(screen.getByRole('combobox', { name: 'Grinder' }), {
        target: { value: GRINDER },
      })
      fireEvent.change(
        screen.getByRole('combobox', { name: 'Brewing Device' }),
        { target: { value: ESP_DEVICE } },
      )
      fireEvent.change(screen.getByLabelText(/^Dose/), {
        target: { value: '18' },
      })
      fireEvent.change(screen.getByLabelText(/^Yield/), {
        target: { value: '36' },
      })
      fireEvent.change(screen.getByLabelText(/^Time/), {
        target: { value: '30' },
      })
      fireEvent.change(screen.getByLabelText(/^Grind Setting/), {
        target: { value: '1.5' },
      })
      await logAndSettle(1)

      pickCoffee(COFFEE_B)
      pickCoffee(COFFEE)
      // The lookup that began before the save answers with an older shot.
      await act(async () => {
        resolveFirstLookup(
          trpcSuccess(
            makeRecentShot({
              id: 'shot-1',
              coffeeId: COFFEE,
              grinderId: GRINDER,
              brewingDeviceId: ESP_DEVICE,
              roastDate: '2026-05-01',
            }),
          ),
        )
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
      expect(screen.queryByText('May 1st, 2026')).toBeNull()
      const lookupsForA = prefillCalls(fetchSpy).filter(
        (call) => coffeeIdFromCall(call) === COFFEE,
      )
      expect(lookupsForA).toHaveLength(1)

      // Only the number formats change, so the retry keeps its key.
      fireEvent.change(screen.getByLabelText(/^Dose/), {
        target: { value: '18.0' },
      })
      fireEvent.change(screen.getByLabelText(/^Time/), {
        target: { value: '030' },
      })
      await logAndSettle(2)

      const keys = createKeys(fetchSpy)
      for (const key of keys) expect(key).toMatch(IDEMPOTENCY_KEY_PATTERN)
      expect(keys[1]).toBe(keys[0])
      expect(createInputs(fetchSpy)[1].roastDate).not.toBe('2026-05-01')
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('resumes a prefill lookup the save interrupted once the API rejects that save', async () => {
    const providers = seeded()
    const { queryClient, trpc, Wrapper, fetchSpy } = providers
    fetchSpy.mockImplementation(
      serveFromCache(providers, () =>
        trpcErrorResponse('BAD_REQUEST', 'Brewing device is not espresso'),
      ),
    )
    try {
      queryClient.removeQueries({
        queryKey: trpc.espressoShot.getLatestUnsealed.queryKey({
          coffeeId: COFFEE,
        }),
      })
      let resolvePrefill: (
        shot: ReturnType<typeof makeRecentShot>,
      ) => void = () => {}
      const pending = new Promise<ReturnType<typeof makeRecentShot>>(
        (resolve) => {
          resolvePrefill = resolve
        },
      )
      void queryClient.prefetchQuery({
        ...trpc.espressoShot.getLatestUnsealed.queryOptions({
          coffeeId: COFFEE,
        }),
        queryFn: () => pending,
      })
      render(<NewEspressoShot />, { wrapper: Wrapper })

      fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
        target: { value: COFFEE },
      })
      fireEvent.change(screen.getByRole('combobox', { name: 'Grinder' }), {
        target: { value: GRINDER },
      })
      fireEvent.change(
        screen.getByRole('combobox', { name: 'Brewing Device' }),
        { target: { value: ESP_DEVICE } },
      )
      fireEvent.change(screen.getByLabelText(/^Dose/), {
        target: { value: '18' },
      })
      fireEvent.change(screen.getByLabelText(/^Yield/), {
        target: { value: '36' },
      })
      fireEvent.change(screen.getByLabelText(/^Time/), {
        target: { value: '30' },
      })
      fireEvent.change(screen.getByLabelText(/^Grind Setting/), {
        target: { value: '1.5' },
      })

      fireEvent.click(screen.getByRole('button', { name: 'Log' }))
      await waitFor(() => expect(createCalls(fetchSpy)).toHaveLength(1))
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Log' })).toHaveProperty(
          'disabled',
          false,
        ),
      )

      // Nothing was saved, so the lookup the save interrupted still applies.
      resolvePrefill(
        makeRecentShot({
          id: 'shot-1',
          coffeeId: COFFEE,
          grinderId: GRINDER_B,
          brewingDeviceId: ESP_DEVICE,
          roastDate: '2026-05-01',
        }),
      )
      await waitFor(() => expect(screen.getByText('May 1st, 2026')))
      // The gear entered by hand stays.
      expect(screen.getByRole('combobox', { name: 'Grinder' })).toHaveProperty(
        'value',
        GRINDER,
      )
      expect(screen.getByLabelText(/^Dose/)).toHaveProperty('value', '18')
      // A prefill is not an edit, so the save's error stays up.
      expect(screen.getByText('Brewing device is not espresso')).toBeTruthy()

      // The refused save committed nothing, so the prefilled draft is a new
      // save, not a retry under that save's key.
      fireEvent.click(screen.getByRole('button', { name: 'Log' }))
      await waitFor(() => expect(createCalls(fetchSpy)).toHaveLength(2))
      const keys = createKeys(fetchSpy)
      expect(createInputs(fetchSpy)[1].roastDate).toBe('2026-05-01')
      expect(keys[1]).not.toBe(keys[0])
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('looks up a reselected coffee again after the API rejects its save', async () => {
    const { Wrapper, fetchSpy } = seeded()
    fetchSpy.mockImplementation(async (...call: Array<unknown>) => {
      if (isPrefillCall(call)) return trpcSuccess(null)
      if (isCreateCall(call)) {
        return trpcErrorResponse('BAD_REQUEST', 'Grinder not found')
      }
      return trpcSuccess()
    })
    const pickCoffee = (id: string) =>
      fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
        target: { value: id },
      })
    try {
      render(<NewEspressoShot />, { wrapper: Wrapper })
      pickCoffee(COFFEE)
      await waitFor(() => expect(prefillCalls(fetchSpy)).toHaveLength(1))
      fireEvent.change(screen.getByRole('combobox', { name: 'Grinder' }), {
        target: { value: GRINDER },
      })
      fireEvent.change(
        screen.getByRole('combobox', { name: 'Brewing Device' }),
        { target: { value: ESP_DEVICE } },
      )
      fireEvent.change(screen.getByLabelText(/^Dose/), {
        target: { value: '18' },
      })
      fireEvent.change(screen.getByLabelText(/^Yield/), {
        target: { value: '36' },
      })
      fireEvent.change(screen.getByLabelText(/^Time/), {
        target: { value: '30' },
      })
      fireEvent.change(screen.getByLabelText(/^Grind Setting/), {
        target: { value: '1.5' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Log' }))
      await waitFor(() => expect(createCalls(fetchSpy)).toHaveLength(1))
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Log' })).toHaveProperty(
          'disabled',
          false,
        ),
      )

      // Nothing was saved, so there is no lost save to restore: the coffee's
      // latest shot is read again.
      pickCoffee(COFFEE_B)
      await waitFor(() => expect(prefillCalls(fetchSpy)).toHaveLength(2))
      pickCoffee(COFFEE)
      await waitFor(() =>
        expect(
          prefillCalls(fetchSpy).filter(
            (call) => coffeeIdFromCall(call) === COFFEE,
          ),
        ).toHaveLength(2),
      )
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it.each([
    { order: 'the coffee is reselected after the recipe returns' },
    { order: 'the recipe returns after the coffee is reselected' },
    { order: 'the recipe returns while a retry of the other is pending' },
  ])(
    'retries the first of two lost saves for one coffee when $order',
    async ({ order }) => {
      const { Wrapper, fetchSpy } = seeded()
      const pending = order.includes('pending')
      let creates = 0
      let failPendingRetry: () => void = () => {}
      fetchSpy.mockImplementation(async (...call: Array<unknown>) => {
        if (isPrefillCall(call)) {
          if (coffeeIdFromCall(call) !== COFFEE) return trpcSuccess(null)
          return trpcSuccess(
            makeRecentShot({
              id: 'shot-1',
              coffeeId: COFFEE,
              grinderId: GRINDER,
              brewingDeviceId: ESP_DEVICE,
              roastDate: '2026-05-01',
            }),
          )
        }
        if (isCreateCall(call)) {
          creates += 1
          if (pending && creates === 3) {
            await new Promise<void>((resolve) => {
              failPendingRetry = resolve
            })
          }
          throw new Error('Network request failed')
        }
        return trpcSuccess()
      })
      const pickCoffee = (id: string) =>
        fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
          target: { value: id },
        })
      const setDose = (value: string) =>
        fireEvent.change(screen.getByLabelText(/^Dose/), { target: { value } })
      const logAndSettle = async (count: number) => {
        fireEvent.click(screen.getByRole('button', { name: 'Log' }))
        await waitFor(() => expect(createCalls(fetchSpy).length).toBe(count))
        await waitFor(() =>
          expect(screen.getByRole('button', { name: 'Log' })).toHaveProperty(
            'disabled',
            false,
          ),
        )
      }
      try {
        render(<NewEspressoShot />, { wrapper: Wrapper })
        pickCoffee(COFFEE)
        expect(await screen.findByText('May 1st, 2026')).toBeTruthy()
        setDose('18')
        fireEvent.change(screen.getByLabelText(/^Yield/), {
          target: { value: '36' },
        })
        fireEvent.change(screen.getByLabelText(/^Time/), {
          target: { value: '30' },
        })
        fireEvent.change(screen.getByLabelText(/^Grind Setting/), {
          target: { value: '1.5' },
        })
        await logAndSettle(1)

        // A second shot of the same coffee, also lost.
        setDose('22')
        await act(async () => {
          fireEvent.click(screen.getByLabelText(/^Roast Date/))
        })
        fireEvent.click(
          await screen.findByRole('button', { name: /May 2nd, 2026/ }),
        )
        expect(await screen.findByText('May 2nd, 2026')).toBeTruthy()
        await logAndSettle(2)

        const reselect = async () => {
          pickCoffee(COFFEE_B)
          pickCoffee(COFFEE)
        }
        if (order === 'the coffee is reselected after the recipe returns') {
          setDose('18')
          await reselect()
        } else if (pending) {
          await reselect()
          expect(await screen.findByText('May 2nd, 2026')).toBeTruthy()
          // Retry the 22 g save, and go back to 18 g before it settles.
          fireEvent.click(screen.getByRole('button', { name: 'Log' }))
          await waitFor(() => expect(createCalls(fetchSpy).length).toBe(3))
          setDose('18')
          await act(async () => {
            failPendingRetry()
            await new Promise((resolve) => setTimeout(resolve, 0))
          })
          await waitFor(() =>
            expect(screen.getByRole('button', { name: 'Log' })).toHaveProperty(
              'disabled',
              false,
            ),
          )
        } else {
          await reselect()
          expect(await screen.findByText('May 2nd, 2026')).toBeTruthy()
          setDose('18')
        }
        expect(await screen.findByText('May 1st, 2026')).toBeTruthy()
        await logAndSettle(pending ? 4 : 3)

        const bodies = createCalls(fetchSpy).map((call) =>
          String((call[1] as RequestInit | undefined)?.body ?? ''),
        )
        // The 18 g retry sends exactly what the 18 g save sent, so the API
        // replays it instead of storing a second shot.
        const keys = createKeys(fetchSpy)
        expect(keys[0]).toMatch(IDEMPOTENCY_KEY_PATTERN)
        expect(keys[1]).toMatch(IDEMPOTENCY_KEY_PATTERN)
        // Two shots, two keys: the API would refuse the 22 g save as a replay
        // conflict under the 18 g save's key.
        expect(keys[1]).not.toBe(keys[0])
        expect(bodies[1]).not.toBe(bodies[0])
        if (pending) expect(bodies[2]).toBe(bodies[1])
        expect(bodies.at(-1)).toBe(bodies[0])
      } finally {
        fetchSpy.mockRestore()
      }
    },
  )

  it('keeps a later lost save of the recipe when an earlier key turns out deleted', async () => {
    const { Wrapper, fetchSpy } = seeded()
    let creates = 0
    fetchSpy.mockImplementation(async (...call: Array<unknown>) => {
      if (isPrefillCall(call)) {
        if (coffeeIdFromCall(call) !== COFFEE) return trpcSuccess(null)
        return trpcSuccess(
          makeRecentShot({
            id: 'shot-1',
            coffeeId: COFFEE,
            grinderId: GRINDER,
            brewingDeviceId: ESP_DEVICE,
            roastDate: '2026-05-01',
          }),
        )
      }
      if (isCreateCall(call)) {
        creates += 1
        // The May 1 shot is deleted elsewhere before its retry lands.
        if (creates === 3) {
          return trpcErrorResponse('CONFLICT', SHOT_IDEMPOTENCY_DELETED)
        }
        throw new Error('Network request failed')
      }
      return trpcSuccess()
    })
    const pickCoffee = (id: string) =>
      fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
        target: { value: id },
      })
    const pickRoastDay = async (name: RegExp) => {
      await act(async () => {
        fireEvent.click(screen.getByLabelText(/^Roast Date/))
      })
      fireEvent.click(await screen.findByRole('button', { name }))
    }
    const logAndSettle = async (count: number) => {
      fireEvent.click(screen.getByRole('button', { name: 'Log' }))
      await waitFor(() => expect(createCalls(fetchSpy).length).toBe(count))
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Log' })).toHaveProperty(
          'disabled',
          false,
        ),
      )
    }
    try {
      render(<NewEspressoShot />, { wrapper: Wrapper })
      pickCoffee(COFFEE)
      expect(await screen.findByText('May 1st, 2026')).toBeTruthy()
      fireEvent.change(screen.getByLabelText(/^Dose/), {
        target: { value: '18' },
      })
      fireEvent.change(screen.getByLabelText(/^Yield/), {
        target: { value: '36' },
      })
      fireEvent.change(screen.getByLabelText(/^Time/), {
        target: { value: '30' },
      })
      fireEvent.change(screen.getByLabelText(/^Grind Setting/), {
        target: { value: '1.5' },
      })
      // The same recipe from two bags, both saves lost: May 1, then May 2.
      await logAndSettle(1)
      await pickRoastDay(/May 2nd, 2026/)
      expect(await screen.findByText('May 2nd, 2026')).toBeTruthy()
      await logAndSettle(2)

      // Retrying the May 1 save finds its shot deleted.
      await pickRoastDay(/May 1st, 2026/)
      expect(await screen.findByText('May 1st, 2026')).toBeTruthy()
      await logAndSettle(3)

      // The May 2 save may still have committed, so reselecting the coffee
      // restores it rather than reading the latest shot.
      pickCoffee(COFFEE_B)
      pickCoffee(COFFEE)
      expect(await screen.findByText('May 2nd, 2026')).toBeTruthy()
      expect(
        prefillCalls(fetchSpy).filter(
          (call) => coffeeIdFromCall(call) === COFFEE,
        ),
      ).toHaveLength(1)
      // The retry replayed May 1 under its own key, apart from May 2's.
      const keys = createKeys(fetchSpy)
      for (const key of keys) expect(key).toMatch(IDEMPOTENCY_KEY_PATTERN)
      expect(keys[2]).toBe(keys[0])
      expect(keys[1]).not.toBe(keys[0])
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('keeps an earlier lost save of the recipe when a later key turns out deleted', async () => {
    const { Wrapper, fetchSpy } = seeded()
    let creates = 0
    let prefills = 0
    fetchSpy.mockImplementation(async (...call: Array<unknown>) => {
      if (isPrefillCall(call)) {
        if (coffeeIdFromCall(call) !== COFFEE) return trpcSuccess(null)
        prefills += 1
        // A later lookup would find a newer shot than either lost save.
        return trpcSuccess(
          makeRecentShot({
            id: `shot-${prefills}`,
            coffeeId: COFFEE,
            grinderId: GRINDER,
            brewingDeviceId: ESP_DEVICE,
            roastDate: prefills === 1 ? '2026-05-01' : '2026-05-03',
          }),
        )
      }
      if (isCreateCall(call)) {
        creates += 1
        // The May 2 shot is deleted elsewhere before its retry lands.
        if (creates === 3) {
          return trpcErrorResponse('CONFLICT', SHOT_IDEMPOTENCY_DELETED)
        }
        throw new Error('Network request failed')
      }
      return trpcSuccess()
    })
    const pickCoffee = (id: string) =>
      fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
        target: { value: id },
      })
    const pickRoastDay = async (name: RegExp) => {
      await act(async () => {
        fireEvent.click(screen.getByLabelText(/^Roast Date/))
      })
      fireEvent.click(await screen.findByRole('button', { name }))
    }
    const logAndSettle = async (count: number) => {
      fireEvent.click(screen.getByRole('button', { name: 'Log' }))
      await waitFor(() => expect(createCalls(fetchSpy).length).toBe(count))
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Log' })).toHaveProperty(
          'disabled',
          false,
        ),
      )
    }
    try {
      render(<NewEspressoShot />, { wrapper: Wrapper })
      pickCoffee(COFFEE)
      expect(await screen.findByText('May 1st, 2026')).toBeTruthy()
      fireEvent.change(screen.getByLabelText(/^Dose/), {
        target: { value: '18' },
      })
      fireEvent.change(screen.getByLabelText(/^Yield/), {
        target: { value: '36' },
      })
      fireEvent.change(screen.getByLabelText(/^Time/), {
        target: { value: '30' },
      })
      fireEvent.change(screen.getByLabelText(/^Grind Setting/), {
        target: { value: '1.5' },
      })
      // The same recipe from two bags, both saves lost: May 1, then May 2.
      await logAndSettle(1)
      await pickRoastDay(/May 2nd, 2026/)
      expect(await screen.findByText('May 2nd, 2026')).toBeTruthy()
      await logAndSettle(2)

      // Reselecting restores the newest lost save, May 2, as an untouched
      // prefill; retrying it finds its shot deleted.
      pickCoffee(COFFEE_B)
      pickCoffee(COFFEE)
      expect(await screen.findByText('May 2nd, 2026')).toBeTruthy()
      await logAndSettle(3)
      // The draft stays as sent, so the next Log saves May 2 anew.
      expect(screen.getByText('May 2nd, 2026')).toBeTruthy()

      // The May 1 save may still have committed, so reselecting the coffee
      // restores it rather than reading the latest shot, and Log replays it.
      pickCoffee(COFFEE_B)
      pickCoffee(COFFEE)
      expect(await screen.findByText('May 1st, 2026')).toBeTruthy()
      expect(prefills).toBe(1)
      await logAndSettle(4)
      const keys = createKeys(fetchSpy)
      for (const key of keys) expect(key).toMatch(IDEMPOTENCY_KEY_PATTERN)
      const inputs = createInputs(fetchSpy)
      // The two lost saves, May 1 and May 2, under their own keys.
      expect(inputs[0].roastDate).toBe('2026-05-01')
      expect(inputs[1].roastDate).toBe('2026-05-02')
      expect(keys[1]).not.toBe(keys[0])
      // The deleted-key reply answered May 2's replay, and the last Log
      // replayed May 1, each exactly as first sent.
      expect(inputs[2]).toEqual(inputs[1])
      expect(inputs[3]).toEqual(inputs[0])
    } finally {
      fetchSpy.mockRestore()
    }
  })

  describe('while a retry that finds its shot deleted is out', () => {
    // Fills the recipe; dose sets it apart.
    const fillRecipe = (dose: string) => {
      fireEvent.change(screen.getByLabelText(/^Dose/), {
        target: { value: dose },
      })
      fireEvent.change(screen.getByLabelText(/^Yield/), {
        target: { value: '36' },
      })
      fireEvent.change(screen.getByLabelText(/^Time/), {
        target: { value: '30' },
      })
      fireEvent.change(screen.getByLabelText(/^Grind Setting/), {
        target: { value: '1.5' },
      })
    }
    const pickCoffee = (id: string) =>
      fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
        target: { value: id },
      })
    const pickRoastDay = async (name: RegExp) => {
      await act(async () => {
        fireEvent.click(screen.getByLabelText(/^Roast Date/))
      })
      fireEvent.click(await screen.findByRole('button', { name }))
    }
    // Every create fails as lost except the third, which waits for the test
    // and then reports its shot deleted.
    // Coffee A's lookups after the first return laterRoastDate.
    const serve = (
      fetchSpy: ReturnType<typeof seeded>['fetchSpy'],
      laterRoastDate = '2026-05-01',
    ) => {
      let creates = 0
      let lookups = 0
      let answerThird: () => void = () => {}
      const third = new Promise<Response>((resolve) => {
        answerThird = () =>
          resolve(trpcErrorResponse('CONFLICT', SHOT_IDEMPOTENCY_DELETED))
      })
      fetchSpy.mockImplementation(async (...call: Array<unknown>) => {
        if (isPrefillCall(call)) {
          if (coffeeIdFromCall(call) !== COFFEE) return trpcSuccess(null)
          lookups += 1
          return trpcSuccess(
            makeRecentShot({
              id: 'shot-1',
              coffeeId: COFFEE,
              grinderId: GRINDER,
              brewingDeviceId: ESP_DEVICE,
              roastDate: lookups === 1 ? '2026-05-01' : laterRoastDate,
            }),
          )
        }
        if (isCreateCall(call)) {
          creates += 1
          if (creates === 3) return third
          throw new Error('Network request failed')
        }
        return trpcSuccess()
      })
      return { answerThird: () => act(async () => answerThird()) }
    }
    const logAndSettle = async (
      fetchSpy: ReturnType<typeof seeded>['fetchSpy'],
      count: number,
    ) => {
      fireEvent.click(screen.getByRole('button', { name: 'Log' }))
      await waitFor(() => expect(createCalls(fetchSpy).length).toBe(count))
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Log' })).toHaveProperty(
          'disabled',
          false,
        ),
      )
    }

    it('still loads a prefill for a coffee reselected meanwhile', async () => {
      const { Wrapper, fetchSpy } = seeded()
      const { answerThird } = serve(fetchSpy, '2026-05-04')
      try {
        render(<NewEspressoShot />, { wrapper: Wrapper })
        pickCoffee(COFFEE)
        expect(await screen.findByText('May 1st, 2026')).toBeTruthy()
        fillRecipe('18')
        await logAndSettle(fetchSpy, 1)
        await logAndSettle(fetchSpy, 2)
        fireEvent.click(screen.getByRole('button', { name: 'Log' }))
        await waitFor(() => expect(createCalls(fetchSpy).length).toBe(3))

        pickCoffee(COFFEE_B)
        pickCoffee(COFFEE)
        await answerThird()
        // The lost save is gone, so the reselection reads the latest shot.
        await waitFor(() =>
          expect(
            prefillCalls(fetchSpy).filter(
              (call) => coffeeIdFromCall(call) === COFFEE,
            ),
          ).toHaveLength(2),
        )
        // And fills the form from it.
        expect(await screen.findByText('May 4th, 2026')).toBeTruthy()
      } finally {
        fetchSpy.mockRestore()
      }
    })

    // Answers each operation of a batched request: a latest-shot lookup with
    // latestFor(coffeeId), anything else empty.
    const reply = (
      call: Array<unknown>,
      latestFor: (coffeeId: string | undefined) => unknown,
    ) => {
      const url = new URL(String(call[0]), 'http://localhost')
      const procedures = decodeURIComponent(
        url.pathname.split('/').pop() ?? '',
      ).split(',')
      const inputs = JSON.parse(
        url.searchParams.get('input') ?? '{}',
      ) as Record<string, { json?: { coffeeId?: string } } | undefined>
      return trpcStreamResponse(
        Object.fromEntries(
          procedures.map((procedure, index) => [
            String(index),
            [
              [
                {
                  result: {
                    data: procedure.endsWith('getLatestUnsealed')
                      ? latestFor(inputs[index]?.json?.coffeeId)
                      : {},
                  },
                },
              ],
            ],
          ]),
        ),
      )
    }
    const shotOn = (coffeeId: string, roastDate: string) =>
      makeRecentShot({
        id: `shot-${coffeeId}-${roastDate}`,
        coffeeId,
        grinderId: GRINDER,
        brewingDeviceId: ESP_DEVICE,
        roastDate,
      })

    it('reads afresh for a coffee reselected after a deleted save', async () => {
      const { Wrapper, fetchSpy } = seeded()
      const replies = [
        () => Promise.reject(new Error('Network request failed')),
        () => trpcErrorResponse('CONFLICT', SHOT_IDEMPOTENCY_DELETED),
      ]
      let creates = 0
      let lookups = 0
      let releaseFirst: () => void = () => {}
      // Coffee A's first read, from before the saves, says May 1 and is held
      // until the end; later reads say May 3. Batched lookups each get a slot.
      fetchSpy.mockImplementation(async (...call: Array<unknown>) => {
        if (isCreateCall(call)) return replies[creates++]()
        const before = lookups
        const response = reply(call, (coffeeId) => {
          if (coffeeId !== COFFEE) return null
          lookups += 1
          return shotOn(COFFEE, lookups === 1 ? '2026-05-01' : '2026-05-03')
        })
        // Hold only the request that carried Coffee A's first lookup.
        if (before > 0 || lookups === 0) return response
        return new Promise<Response>((resolve) => {
          releaseFirst = () => resolve(response)
        })
      })
      try {
        render(<NewEspressoShot />, { wrapper: Wrapper })
        pickCoffee(COFFEE)
        fireEvent.change(screen.getByRole('combobox', { name: 'Grinder' }), {
          target: { value: GRINDER },
        })
        fireEvent.change(
          screen.getByRole('combobox', { name: 'Brewing Device' }),
          { target: { value: ESP_DEVICE } },
        )
        fillRecipe('18')
        await logAndSettle(fetchSpy, 1)
        await logAndSettle(fetchSpy, 2)

        pickCoffee(COFFEE_B)
        pickCoffee(COFFEE)
        await act(async () => releaseFirst())
        expect(await screen.findByText('May 3rd, 2026')).toBeTruthy()
        expect(screen.queryByText('May 1st, 2026')).toBeNull()
      } finally {
        fetchSpy.mockRestore()
      }
    })

    it('keeps the draft after a deleted save when the next Log is refused', async () => {
      const { Wrapper, fetchSpy } = seeded()
      const replies = [
        () => Promise.reject(new Error('Network request failed')),
        () => Promise.reject(new Error('Network request failed')),
        () => trpcErrorResponse('CONFLICT', SHOT_IDEMPOTENCY_DELETED),
        () => trpcErrorResponse('BAD_REQUEST', 'Refused'),
      ]
      let creates = 0
      fetchSpy.mockImplementation(async (...call: Array<unknown>) => {
        if (isPrefillCall(call)) {
          return trpcSuccess(
            coffeeIdFromCall(call) === COFFEE
              ? makeRecentShot({
                  id: 'shot-1',
                  coffeeId: COFFEE,
                  grinderId: GRINDER,
                  brewingDeviceId: ESP_DEVICE,
                  roastDate: '2026-05-01',
                })
              : null,
          )
        }
        if (isCreateCall(call)) return replies[creates++]()
        return trpcSuccess()
      })
      try {
        render(<NewEspressoShot />, { wrapper: Wrapper })
        pickCoffee(COFFEE)
        expect(await screen.findByText('May 1st, 2026')).toBeTruthy()
        fillRecipe('18')
        // A lost May 1 save, then May 2's save is lost and reported deleted.
        await logAndSettle(fetchSpy, 1)
        await pickRoastDay(/May 2nd, 2026/)
        await logAndSettle(fetchSpy, 2)
        // A reselection leaves the roast date to the saves: May 2, the newest.
        pickCoffee(COFFEE_B)
        pickCoffee(COFFEE)
        expect(await screen.findByText('May 2nd, 2026')).toBeTruthy()
        await logAndSettle(fetchSpy, 3)
        expect(await screen.findByText('May 2nd, 2026')).toBeTruthy()

        // The untouched May 2 draft is refused; May 1 must not come back.
        await logAndSettle(fetchSpy, 4)
        await act(async () => {})
        expect(screen.queryByText('May 1st, 2026')).toBeNull()
        expect(screen.getByText('May 2nd, 2026')).toBeTruthy()
      } finally {
        fetchSpy.mockRestore()
      }
    })

    // Form 1 logs a shot of A and is closed while the save is out; form 2
    // picks coffeeId. Its read from before the save settles answers the stale
    // May 2 and is held until the end; a read after it answers May 3.
    const reopenDuringSave = async (
      coffeeId: string,
      settle: 'lost' | 'saved',
      frozenClock = false,
    ) => {
      // A frozen clock stamps the cache and the reopened read in one tick.
      const clock = frozenClock
        ? vi.spyOn(Date, 'now').mockReturnValue(Date.now())
        : null
      const { Wrapper, fetchSpy, queryClient, trpc } = seeded()
      if (coffeeId === COFFEE_B) {
        // Nothing cached for B, as on a first visit.
        queryClient.removeQueries({
          queryKey: trpc.espressoShot.getLatestUnsealed.queryKey({
            coffeeId: COFFEE_B,
          }),
        })
      }
      let settleSave: () => void = () => {}
      const held: Array<() => void> = []
      let settled = false
      let form2 = false
      fetchSpy.mockImplementation(async (...call: Array<unknown>) => {
        if (isCreateCall(call)) {
          return new Promise<Response>((resolve, reject) => {
            settleSave = () => {
              settled = true
              return settle === 'saved'
                ? resolve(trpcSuccess())
                : reject(new Error('Network request failed'))
            }
          })
        }
        const carries = decodeURIComponent(String(call[0])).includes(coffeeId)
        const response = reply(call, (id) =>
          id === coffeeId && form2 && carries
            ? shotOn(coffeeId, settled ? '2026-05-03' : '2026-05-02')
            : id === COFFEE
              ? shotOn(COFFEE, '2026-05-01')
              : null,
        )
        if (!form2 || !carries || settled) return response
        return new Promise<Response>((resolve) => {
          held.push(() => resolve(response))
        })
      })
      try {
        const first = render(<NewEspressoShot />, { wrapper: Wrapper })
        pickCoffee(COFFEE)
        expect(await screen.findByText('May 1st, 2026')).toBeTruthy()
        fillRecipe('18')
        fireEvent.click(screen.getByRole('button', { name: 'Log' }))
        await waitFor(() => expect(createCalls(fetchSpy)).toHaveLength(1))
        first.unmount()

        form2 = true
        render(<NewEspressoShot />, { wrapper: Wrapper })
        pickCoffee(coffeeId)
        await waitFor(() =>
          expect(
            fetchSpy.mock.calls.filter((c) =>
              decodeURIComponent(String(c[0])).includes(coffeeId),
            ).length,
          ).toBeGreaterThan(coffeeId === COFFEE ? 1 : 0),
        )
        await act(async () => settleSave())
        expect(await screen.findByText('May 3rd, 2026')).toBeTruthy()
        // The read from before the save answers late; it must not land.
        await act(async () => held.forEach((release) => release()))
        await act(async () => {})
        expect(screen.getByText('May 3rd, 2026')).toBeTruthy()
        expect(screen.queryByText('May 1st, 2026')).toBeNull()
        expect(screen.queryByText('May 2nd, 2026')).toBeNull()
        expect(
          screen.queryByText(/couldn't load this coffee's last shot/),
        ).toBeNull()
      } finally {
        fetchSpy.mockRestore()
        clock?.mockRestore()
      }
    }

    it('reads afresh in a form reopened on the same coffee while a save was out', () =>
      reopenDuringSave(COFFEE, 'lost'))

    it('reads afresh when the cancelled read and the cache share a clock tick', () =>
      reopenDuringSave(COFFEE, 'lost', true))

    it('keeps another form’s lookup for another coffee when a save succeeds', () =>
      reopenDuringSave(COFFEE_B, 'saved'))

    it('reads afresh for another coffee when a save that may have committed is lost', () =>
      reopenDuringSave(COFFEE_B, 'lost'))

    const isLookupOfA = (call: Array<unknown>) =>
      isPrefillCall(call) &&
      decodeURIComponent(String(call[0])).includes(COFFEE)
    const cancelLookups = (
      queryClient: ReturnType<typeof seeded>['queryClient'],
      trpc: ReturnType<typeof seeded>['trpc'],
    ) =>
      act(async () => {
        await queryClient.cancelQueries(
          trpc.espressoShot.getLatestUnsealed.queryFilter(),
        )
      })

    it('reports a lookup that saves keep cancelling rather than apply the cache', async () => {
      // Coffee A's cache says May 1; its reads never answer, and other forms'
      // saves cancel each one.
      const { Wrapper, fetchSpy, queryClient, trpc } = seeded()
      let reads = 0
      fetchSpy.mockImplementation(async (...call: Array<unknown>) => {
        if (!isLookupOfA(call)) return reply(call, () => null)
        reads += 1
        return new Promise<Response>(() => {})
      })
      try {
        render(<NewEspressoShot />, { wrapper: Wrapper })
        pickCoffee(COFFEE)
        for (let read = 1; read <= 6; read++) {
          await waitFor(() => expect(reads).toBe(read))
          await cancelLookups(queryClient, trpc)
        }
        expect(
          await screen.findByText(/couldn't load this coffee's last shot/),
        ).toBeTruthy()
        expect(screen.queryByText('May 1st, 2026')).toBeNull()
        expect(reads).toBe(6)
      } finally {
        fetchSpy.mockRestore()
      }
    })

    it('reads afresh when the clock moves back while a save cancels the lookup', async () => {
      // Coffee A's cache says May 1, stamped now; the server says May 3.
      const { Wrapper, fetchSpy, queryClient, trpc } = seeded()
      let reads = 0
      fetchSpy.mockImplementation(async (...call: Array<unknown>) => {
        if (!isLookupOfA(call)) return reply(call, () => null)
        reads += 1
        if (reads === 1) return new Promise<Response>(() => {})
        return reply(call, (id) =>
          id === COFFEE ? shotOn(COFFEE, '2026-05-03') : null,
        )
      })
      const earlier = Date.now() - 60_000
      const clock = vi.spyOn(Date, 'now')
      try {
        render(<NewEspressoShot />, { wrapper: Wrapper })
        pickCoffee(COFFEE)
        await waitFor(() => expect(reads).toBe(1))
        // The cache's stamp is now in the future, so it looks fresh.
        clock.mockReturnValue(earlier)
        await cancelLookups(queryClient, trpc)
        expect(await screen.findByText('May 3rd, 2026')).toBeTruthy()
        expect(screen.queryByText('May 1st, 2026')).toBeNull()
      } finally {
        clock.mockRestore()
        fetchSpy.mockRestore()
      }
    })

    it('keeps the draft when a refused Log follows a lookup for another coffee', async () => {
      const { Wrapper, fetchSpy } = seeded()
      const replies = [
        () => Promise.reject(new Error('Network request failed')),
        () => Promise.reject(new Error('Network request failed')),
        () => trpcErrorResponse('CONFLICT', SHOT_IDEMPOTENCY_DELETED),
        () => trpcErrorResponse('BAD_REQUEST', 'Refused'),
      ]
      let creates = 0
      const releases: Array<() => void> = []
      fetchSpy.mockImplementation(async (...call: Array<unknown>) => {
        if (isCreateCall(call)) return replies[creates++]()
        const response = reply(call, (coffeeId) =>
          coffeeId === COFFEE_B ? shotOn(COFFEE_B, '2026-05-01') : null,
        )
        // A's lookups never answer while the test runs.
        if (!decodeURIComponent(String(call[0])).includes(COFFEE)) {
          return response
        }
        return new Promise<Response>((resolve) => {
          releases.push(() => resolve(response))
        })
      })
      try {
        render(<NewEspressoShot />, { wrapper: Wrapper })
        // A's lookup is still out when the user switches to B.
        pickCoffee(COFFEE)
        await waitFor(() => expect(releases).toHaveLength(1))
        pickCoffee(COFFEE_B)
        expect(await screen.findByText('May 1st, 2026')).toBeTruthy()
        fillRecipe('18')
        // A lost May 1 save of B, then May 2's is lost and reported deleted.
        await logAndSettle(fetchSpy, 1)
        await pickRoastDay(/May 2nd, 2026/)
        await logAndSettle(fetchSpy, 2)
        // A reselection leaves the roast date to the saves: May 2, the
        // newest. It starts another lookup of A, which stays out.
        pickCoffee(COFFEE)
        pickCoffee(COFFEE_B)
        expect(await screen.findByText('May 2nd, 2026')).toBeTruthy()
        await logAndSettle(fetchSpy, 3)
        expect(await screen.findByText('May 2nd, 2026')).toBeTruthy()

        // The untouched May 2 draft is refused; May 1 must not come back.
        await logAndSettle(fetchSpy, 4)
        await act(async () => {})
        expect(screen.queryByText('May 1st, 2026')).toBeNull()
        expect(screen.getByText('May 2nd, 2026')).toBeTruthy()
      } finally {
        releases.forEach((release) => release())
        fetchSpy.mockRestore()
      }
    })

    it("restores another lost save's roast date for a recipe edited meanwhile", async () => {
      const { Wrapper, fetchSpy } = seeded()
      const { answerThird } = serve(fetchSpy)
      try {
        render(<NewEspressoShot />, { wrapper: Wrapper })
        pickCoffee(COFFEE)
        expect(await screen.findByText('May 1st, 2026')).toBeTruthy()
        // Two lost saves: dose 18 from the May 2 bag, dose 19 from May 3.
        fillRecipe('18')
        await pickRoastDay(/May 2nd, 2026/)
        expect(await screen.findByText('May 2nd, 2026')).toBeTruthy()
        await logAndSettle(fetchSpy, 1)
        fillRecipe('19')
        await pickRoastDay(/May 3rd, 2026/)
        expect(await screen.findByText('May 3rd, 2026')).toBeTruthy()
        await logAndSettle(fetchSpy, 2)
        // A reselection leaves the roast date to the saves, and editing back
        // to dose 18 restores its May 2.
        pickCoffee(COFFEE_B)
        pickCoffee(COFFEE)
        expect(await screen.findByText('May 3rd, 2026')).toBeTruthy()
        fillRecipe('18')
        expect(await screen.findByText('May 2nd, 2026')).toBeTruthy()

        // The dose 18 retry is out when the recipe goes back to dose 19.
        fireEvent.click(screen.getByRole('button', { name: 'Log' }))
        await waitFor(() => expect(createCalls(fetchSpy).length).toBe(3))
        fillRecipe('19')
        await answerThird()
        expect(await screen.findByText('May 3rd, 2026')).toBeTruthy()
      } finally {
        fetchSpy.mockRestore()
      }
    })
  })

  it("reuses a lost save's key after a note is typed and erased", async () => {
    const providers = seeded()
    const { Wrapper, fetchSpy } = providers
    fetchSpy.mockImplementation(
      serveFromCache(providers, () => {
        throw new Error('Network request failed')
      }),
    )
    try {
      render(<NewEspressoShot />, { wrapper: Wrapper })
      fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
        target: { value: COFFEE },
      })
      expect(await screen.findByDisplayValue('Niche Zero')).toBeTruthy()
      fireEvent.change(screen.getByLabelText(/^Dose/), {
        target: { value: '18' },
      })
      fireEvent.change(screen.getByLabelText(/^Yield/), {
        target: { value: '36' },
      })
      fireEvent.change(screen.getByLabelText(/^Time/), {
        target: { value: '30' },
      })
      fireEvent.change(screen.getByLabelText(/^Grind Setting/), {
        target: { value: '1.5' },
      })
      const log = async (calls: number) => {
        await waitFor(() =>
          expect(screen.getByRole('button', { name: 'Log' })).toHaveProperty(
            'disabled',
            false,
          ),
        )
        fireEvent.click(screen.getByRole('button', { name: 'Log' }))
        await waitFor(() => expect(createCalls(fetchSpy).length).toBe(calls))
      }
      await log(1)
      const notes = screen.getByLabelText(/^Notes/)
      fireEvent.change(notes, { target: { value: 'sour' } })
      fireEvent.change(notes, { target: { value: '' } })
      await log(2)

      const bodies = createCalls(fetchSpy).map((call) =>
        String((call[1] as RequestInit | undefined)?.body ?? ''),
      )
      // The form looks as it did, so the retry sends the same shot.
      expect(createKeys(fetchSpy)[0]).toMatch(IDEMPOTENCY_KEY_PATTERN)
      expect(bodies[1]).toBe(bodies[0])
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('prefills a newly chosen coffee after a failed save', async () => {
    const providers = seeded()
    const { Wrapper, fetchSpy } = providers
    fetchSpy.mockImplementation(
      serveFromCache(providers, () => {
        throw new Error('Network request failed')
      }),
    )
    try {
      render(<NewEspressoShot />, { wrapper: Wrapper })
      fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
        target: { value: COFFEE },
      })
      expect(await screen.findByText('May 1st, 2026')).toBeTruthy()
      fireEvent.change(screen.getByRole('combobox', { name: 'Grinder' }), {
        target: { value: GRINDER },
      })
      fireEvent.change(
        screen.getByRole('combobox', { name: 'Brewing Device' }),
        {
          target: { value: ESP_DEVICE },
        },
      )
      fireEvent.change(screen.getByLabelText(/^Dose/), {
        target: { value: '18' },
      })
      fireEvent.change(screen.getByLabelText(/^Yield/), {
        target: { value: '36' },
      })
      fireEvent.change(screen.getByLabelText(/^Time/), {
        target: { value: '30' },
      })
      fireEvent.change(screen.getByLabelText(/^Grind Setting/), {
        target: { value: '1.5' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Log' }))
      await waitFor(() => expect(createCalls(fetchSpy).length).toBe(1))
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Log' })).toHaveProperty(
          'disabled',
          false,
        ),
      )

      fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
        target: { value: COFFEE_B },
      })
      expect(await screen.findByText('April 1st, 2026')).toBeTruthy()
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('does not apply a pre-save prefill after a later coffee is chosen', async () => {
    const providers = seeded()
    const { queryClient, trpc, Wrapper, fetchSpy } = providers
    queryClient.removeQueries({
      queryKey: trpc.espressoShot.getLatestUnsealed.queryKey({
        coffeeId: COFFEE,
      }),
    })
    let resolvePrefill: (
      shot: ReturnType<typeof makeRecentShot>,
    ) => void = () => {}
    const pending = new Promise<ReturnType<typeof makeRecentShot>>(
      (resolve) => {
        resolvePrefill = resolve
      },
    )
    void queryClient.prefetchQuery({
      ...trpc.espressoShot.getLatestUnsealed.queryOptions({
        coffeeId: COFFEE,
      }),
      queryFn: () => pending,
    })
    fetchSpy.mockImplementation(
      serveFromCache(providers, () => {
        throw new Error('Network request failed')
      }),
    )
    try {
      render(<NewEspressoShot />, { wrapper: Wrapper })
      fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
        target: { value: COFFEE },
      })
      fireEvent.change(screen.getByRole('combobox', { name: 'Grinder' }), {
        target: { value: GRINDER },
      })
      fireEvent.change(
        screen.getByRole('combobox', { name: 'Brewing Device' }),
        {
          target: { value: ESP_DEVICE },
        },
      )
      fireEvent.change(screen.getByLabelText(/^Dose/), {
        target: { value: '18' },
      })
      fireEvent.change(screen.getByLabelText(/^Yield/), {
        target: { value: '36' },
      })
      fireEvent.change(screen.getByLabelText(/^Time/), {
        target: { value: '30' },
      })
      fireEvent.change(screen.getByLabelText(/^Grind Setting/), {
        target: { value: '1.5' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Log' }))
      await waitFor(() => expect(createCalls(fetchSpy).length).toBe(1))
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Log' })).toHaveProperty(
          'disabled',
          false,
        ),
      )

      fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
        target: { value: COFFEE_B },
      })
      expect(await screen.findByText('April 1st, 2026')).toBeTruthy()

      resolvePrefill(
        makeRecentShot({
          id: 'shot-1',
          coffeeId: COFFEE,
          grinderId: GRINDER,
          brewingDeviceId: ESP_DEVICE,
          roastDate: '2026-05-01',
        }),
      )
      await act(async () => {
        await pending
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
      expect(screen.queryByText('May 1st, 2026')).toBeNull()
      expect(screen.getByText('April 1st, 2026')).toBeTruthy()
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('prefills the coffee chosen during a pending save once the save fails', async () => {
    const providers = seeded()
    const { Wrapper, fetchSpy } = providers
    let rejectCreate: (reason: Error) => void = () => {}
    const pendingCreate = new Promise<Response>((_resolve, reject) => {
      rejectCreate = reject
    })
    fetchSpy.mockImplementation(async (...call: Array<unknown>) => {
      if (isCreateCall(call)) return pendingCreate
      return serveFromCache(providers)(...call)
    })
    try {
      render(<NewEspressoShot />, { wrapper: Wrapper })
      fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
        target: { value: COFFEE },
      })
      expect(await screen.findByText('May 1st, 2026')).toBeTruthy()
      fireEvent.change(screen.getByRole('combobox', { name: 'Grinder' }), {
        target: { value: GRINDER },
      })
      fireEvent.change(
        screen.getByRole('combobox', { name: 'Brewing Device' }),
        {
          target: { value: ESP_DEVICE },
        },
      )
      fireEvent.change(screen.getByLabelText(/^Dose/), {
        target: { value: '18' },
      })
      fireEvent.change(screen.getByLabelText(/^Yield/), {
        target: { value: '36' },
      })
      fireEvent.change(screen.getByLabelText(/^Time/), {
        target: { value: '30' },
      })
      fireEvent.change(screen.getByLabelText(/^Grind Setting/), {
        target: { value: '1.5' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Log' }))
      await waitFor(() => expect(createCalls(fetchSpy).length).toBe(1))
      const prefillsDuringSave = prefillCalls(fetchSpy).length
      // A second submit (Enter in a field) while the save is pending is
      // ignored, so the save still counts as pending below.
      await act(async () => {
        fireEvent.submit(
          screen.getByRole('button', { name: 'Logging…' }).closest('form')!,
        )
      })
      expect(createCalls(fetchSpy)).toHaveLength(1)

      fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
        target: { value: COFFEE_B },
      })
      // Let tRPC dispatch any batched lookup while the create is still pending.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
      expect(prefillCalls(fetchSpy)).toHaveLength(prefillsDuringSave)
      expect(screen.queryByText('May 1st, 2026')).toBeNull()
      expect(screen.queryByText('April 1st, 2026')).toBeNull()

      rejectCreate(new Error('Network request failed'))
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Log' })).toHaveProperty(
          'disabled',
          false,
        ),
      )

      expect(await screen.findByText('April 1st, 2026')).toBeTruthy()
      expect(screen.queryByText('May 1st, 2026')).toBeNull()
      const coffeeIds = prefillCalls(fetchSpy).map((call) =>
        coffeeIdFromCall(call),
      )
      expect(coffeeIds.at(-1)).toBe(COFFEE_B)
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('does not prefill from Try again while a create is pending', async () => {
    const providers = seeded()
    const { queryClient, trpc, Wrapper, fetchSpy } = providers
    queryClient.removeQueries({
      queryKey: trpc.espressoShot.getLatestUnsealed.queryKey({
        coffeeId: COFFEE,
      }),
    })
    let resolveCreate: (value: Response) => void = () => {}
    const pendingCreate = new Promise<Response>((resolve) => {
      resolveCreate = resolve
    })
    fetchSpy.mockImplementation(async (...call: Array<unknown>) => {
      if (isPrefillCall(call)) throw new Error('Network request failed')
      if (isCreateCall(call)) return pendingCreate
      return trpcSuccess()
    })
    try {
      render(<NewEspressoShot />, { wrapper: Wrapper })
      fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
        target: { value: COFFEE },
      })
      expect(
        await screen.findByRole('button', { name: 'Try again' }),
      ).toBeTruthy()
      fireEvent.change(screen.getByRole('combobox', { name: 'Grinder' }), {
        target: { value: GRINDER },
      })
      fireEvent.change(
        screen.getByRole('combobox', { name: 'Brewing Device' }),
        {
          target: { value: ESP_DEVICE },
        },
      )
      fireEvent.change(screen.getByLabelText(/^Dose/), {
        target: { value: '18' },
      })
      fireEvent.change(screen.getByLabelText(/^Yield/), {
        target: { value: '36' },
      })
      fireEvent.change(screen.getByLabelText(/^Time/), {
        target: { value: '30' },
      })
      fireEvent.change(screen.getByLabelText(/^Grind Setting/), {
        target: { value: '1.5' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Log' }))
      // Retry only once the save is visibly pending and its request is held.
      expect(
        await screen.findByRole('button', { name: 'Logging…' }),
      ).toBeTruthy()
      await waitFor(() => expect(createCalls(fetchSpy).length).toBe(1))
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
      // Let tRPC dispatch any lookup Try again queued before counting.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
      expect(prefillCalls(fetchSpy)).toHaveLength(1)
    } finally {
      resolveCreate(trpcSuccess())
      fetchSpy.mockRestore()
    }
  })

  it('shows a retry when the last shot cannot be loaded and still lets you enter one', async () => {
    const providers = seeded()
    const { queryClient, trpc, Wrapper, fetchSpy } = providers
    const shot = makeRecentShot({
      id: 'shot-1',
      coffeeId: COFFEE,
      grinderId: GRINDER,
      brewingDeviceId: ESP_DEVICE,
      roastDate: '2026-05-01',
    })
    let lookups = 0
    fetchSpy.mockImplementation(async (...call: Array<unknown>) => {
      if (isPrefillCall(call)) {
        lookups += 1
        if (lookups === 1) throw new Error('Network request failed')
        return trpcSuccess(shot)
      }
      return trpcSuccess()
    })
    try {
      queryClient.removeQueries({
        queryKey: trpc.espressoShot.getLatestUnsealed.queryKey({
          coffeeId: COFFEE,
        }),
      })
      render(<NewEspressoShot />, { wrapper: Wrapper })

      fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
        target: { value: COFFEE },
      })

      expect(
        await screen.findByText(
          "We couldn't load this coffee's last shot. Enter it yourself, or try again.",
        ),
      ).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
      expect(prefillCalls(fetchSpy)).toHaveLength(1)
      fireEvent.change(screen.getByLabelText(/^Dose/), {
        target: { value: '18' },
      })
      expect(screen.getByDisplayValue('18')).toBeTruthy()

      fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
      expect(await screen.findByDisplayValue('Niche Zero')).toBeTruthy()
      expect(prefillCalls(fetchSpy)).toHaveLength(2)
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('clears the previous coffee’s grinder and device before the next lookup', async () => {
    const providers = seeded()
    const { Wrapper, fetchSpy } = providers
    let resolveB: (shot: ReturnType<typeof makeRecentShot>) => void = () => {}
    const pendingB = new Promise<ReturnType<typeof makeRecentShot>>(
      (resolve) => {
        resolveB = resolve
      },
    )
    fetchSpy.mockImplementation(async (...call: Array<unknown>) => {
      if (isPrefillCall(call) && coffeeIdFromCall(call) === COFFEE_B) {
        return trpcSuccess(await pendingB)
      }
      return serveFromCache(providers)(...call)
    })
    render(<NewEspressoShot />, { wrapper: Wrapper })

    fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
      target: { value: COFFEE },
    })
    expect(await screen.findByDisplayValue('Niche Zero')).toBeTruthy()
    expect(screen.getByDisplayValue('Linea Mini')).toBeTruthy()

    fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
      target: { value: COFFEE_B },
    })
    expect(screen.queryByDisplayValue('Niche Zero')).toBeNull()
    expect(screen.getByRole('combobox', { name: 'Grinder' })).toHaveProperty(
      'value',
      '',
    )
    expect(
      screen.getByRole('combobox', { name: 'Brewing Device' }),
    ).toHaveProperty('value', '')

    resolveB(
      makeRecentShot({
        id: 'shot-b',
        coffeeId: COFFEE_B,
        grinderId: GRINDER_B,
        brewingDeviceId: ESP_DEVICE,
        roastDate: '2026-04-01',
      }),
    )
    expect(await screen.findByDisplayValue('P64')).toBeTruthy()
    expect(screen.getByDisplayValue('Linea Mini')).toBeTruthy()
  })

  it('clears prefill when Coffee is emptied', async () => {
    const { Wrapper } = seeded()
    render(<NewEspressoShot />, { wrapper: Wrapper })

    fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
      target: { value: COFFEE },
    })
    expect(await screen.findByDisplayValue('Niche Zero')).toBeTruthy()
    expect(screen.getByDisplayValue('Linea Mini')).toBeTruthy()

    fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
      target: { value: '' },
    })
    expect(screen.getByRole('combobox', { name: 'Grinder' })).toHaveProperty(
      'value',
      '',
    )
    expect(
      screen.getByRole('combobox', { name: 'Brewing Device' }),
    ).toHaveProperty('value', '')
    expect(screen.queryByText('May 1st, 2026')).toBeNull()
  })

  it('shows Logging… on the Log button while a save is in flight', async () => {
    const providers = seeded()
    const { Wrapper, fetchSpy } = providers
    let finishCreate: (() => void) | undefined
    fetchSpy.mockImplementation(
      serveFromCache(
        providers,
        () =>
          new Promise((resolve) => {
            finishCreate = () => resolve(trpcSuccess())
          }),
      ),
    )
    render(<NewEspressoShot />, { wrapper: Wrapper })

    fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
      target: { value: COFFEE },
    })
    expect(await screen.findByDisplayValue('Niche Zero')).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/^Dose/), {
      target: { value: '18' },
    })
    fireEvent.change(screen.getByLabelText(/^Yield/), {
      target: { value: '36' },
    })
    fireEvent.change(screen.getByLabelText(/^Time/), {
      target: { value: '30' },
    })
    fireEvent.change(screen.getByLabelText(/^Grind Setting/), {
      target: { value: '1.5' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Log' }))
    const log = await screen.findByRole('button', { name: 'Logging…' })
    expect(log).toHaveProperty('disabled', true)
    expect(log.getAttribute('aria-busy')).toBe('true')
    const completeCreate = await waitFor(() => {
      expect(finishCreate).toBeTypeOf('function')
      return finishCreate as () => void
    })
    completeCreate()
    expect(await screen.findByRole('button', { name: 'Log' })).toBeTruthy()
  })
})
