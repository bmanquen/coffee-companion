import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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
const GRINDER = '00000000-0000-4000-8000-000000000003'
const ESP_DEVICE = '00000000-0000-4000-8000-000000000005'
const AERO_DEVICE = '00000000-0000-4000-8000-000000000004'
const ts = new Date('2026-06-01T08:00:00.000Z')

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
  ])
  qc.setQueryData(trpc.grinder.list.queryKey(), [
    makeGrinder({ id: GRINDER, name: 'Niche Zero' }),
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
  qc.setQueryData(
    trpc.dialedInBrew.get.queryKey({
      coffeeId: COFFEE,
      brewingMethod: 'espresso',
      brewingDeviceId: ESP_DEVICE,
    }),
    [],
  )
  return providers
}

const NewEspressoShot = Route.options.component!

function createCalls(fetchSpy: { mock: { calls: Array<Array<unknown>> } }) {
  return fetchSpy.mock.calls.filter((call) =>
    String(call[0]).includes('espressoShot.create'),
  )
}

describe('NewEspressoShot form', () => {
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
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(trpcSuccess())
    try {
      const { Wrapper } = seeded()
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
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('Network request failed'))
      .mockResolvedValue(trpcSuccess())
    try {
      const { Wrapper } = seeded()
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
})
