import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Route } from './new'
import { useFieldContext } from '@/hooks/form-context'
import { seedLatestUnsealed } from '@/test/espresso-shots'
import {
  makeBrewingDevice,
  makeCoffee,
  makeGrinder,
  makeRecentShot,
} from '@/test/factories'
import { createTestProviders } from '@/test/providers'
import { trpcSuccess } from '@/test/trpc-response'

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

function prefillResponse(
  queryClient: ReturnType<typeof createTestProviders>['queryClient'],
  trpc: ReturnType<typeof createTestProviders>['trpc'],
  call: Array<unknown>,
) {
  const coffeeId = coffeeIdFromCall(call)
  if (!coffeeId) return trpcSuccess(null)
  return trpcSuccess(
    queryClient.getQueryData(
      trpc.espressoShot.getLatestUnsealed.queryKey({ coffeeId }),
    ) ?? null,
  )
}

function serveFromCache(
  providers: ReturnType<typeof createTestProviders>,
  create?: (call: Array<unknown>) => Promise<Response> | Response,
) {
  return async (...call: Array<unknown>) => {
    if (isCreateCall(call) && create) return create(call)
    if (isPrefillCall(call)) {
      return prefillResponse(providers.queryClient, providers.trpc, call)
    }
    if (isCreateCall(call)) return trpcSuccess()
    return trpcSuccess()
  }
}

function createCalls(fetchSpy: { mock: { calls: Array<Array<unknown>> } }) {
  return fetchSpy.mock.calls.filter((call) => isCreateCall(call))
}

function prefillCalls(fetchSpy: { mock: { calls: Array<Array<unknown>> } }) {
  return fetchSpy.mock.calls.filter((call) => isPrefillCall(call))
}

describe('NewEspressoShot form', () => {
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
      const body = String(
        (createCall[1] as RequestInit | undefined)?.body ?? '',
      )
      expect(body).toContain('18')
      expect(body).toContain('36')
      expect(body).toContain(COFFEE)
      expect(body).toContain('2026-05-01')
      expect(body).not.toContain('2026-04-30')
      expect(body).not.toMatch(/2026-05-01T/)
      await waitFor(() =>
        expect(mocks.track).toHaveBeenCalledWith('brew_logged', {
          method: 'espresso',
        }),
      )
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: '/brews',
        search: { method: 'espresso' },
      })
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

      const keys = createCalls(fetchSpy).map((call) => {
        const init = call[1] as RequestInit | undefined
        return String(init?.body ?? '').match(
          /"idempotencyKey"\s*:\s*"([^"]+)"/,
        )?.[1]
      })
      expect(keys[0]).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      )
      expect(keys[0]).toBe(keys[1])
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

      const bodies = createCalls(fetchSpy).map((call) =>
        String((call[1] as RequestInit | undefined)?.body ?? ''),
      )
      const keys = bodies.map(
        (body) => body.match(/"idempotencyKey"\s*:\s*"([^"]+)"/)?.[1],
      )
      expect(keys[0]).toMatch(IDEMPOTENCY_KEY_PATTERN)
      expect(keys[1]).toMatch(IDEMPOTENCY_KEY_PATTERN)
      expect(keys[0]).not.toBe(keys[1])
      expect(bodies[1]).toContain('22')
      expect(bodies[1]).not.toMatch(/"dose"\s*:\s*"18"/)
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
    let resolvePrefill: (shot: ReturnType<typeof makeRecentShot>) => void =
      () => {}
    const pending = new Promise<ReturnType<typeof makeRecentShot>>((resolve) => {
      resolvePrefill = resolve
    })
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
      let resolvePrefill: (shot: ReturnType<typeof makeRecentShot>) => void =
        () => {}
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
      fireEvent.change(screen.getByRole('combobox', { name: 'Brewing Device' }), {
        target: { value: ESP_DEVICE },
      })
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
      const bodies = createCalls(fetchSpy).map((call) =>
        String((call[1] as RequestInit | undefined)?.body ?? ''),
      )
      const keys = bodies.map(
        (body) => body.match(/"idempotencyKey"\s*:\s*"([^"]+)"/)?.[1],
      )
      expect(keys[0]).toBe(keys[1])
      expect(bodies[1]).not.toContain('2026-05-01')
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('prefills from Try again after a failed save', async () => {
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
      fireEvent.change(screen.getByRole('combobox', { name: 'Brewing Device' }), {
        target: { value: ESP_DEVICE },
      })
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

      fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
      await waitFor(() => expect(lookups).toBe(2))
      expect(await screen.findByText('May 1st, 2026')).toBeTruthy()
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
      fireEvent.change(screen.getByRole('combobox', { name: 'Brewing Device' }), {
        target: { value: ESP_DEVICE },
      })
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
    let resolvePrefill: (shot: ReturnType<typeof makeRecentShot>) => void =
      () => {}
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
      fireEvent.change(screen.getByRole('combobox', { name: 'Brewing Device' }), {
        target: { value: ESP_DEVICE },
      })
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
      fireEvent.change(screen.getByRole('combobox', { name: 'Brewing Device' }), {
        target: { value: ESP_DEVICE },
      })
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
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
      await waitFor(() => expect(createCalls(fetchSpy).length).toBe(1))
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
    const pendingB = new Promise<ReturnType<typeof makeRecentShot>>((resolve) => {
      resolveB = resolve
    })
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
