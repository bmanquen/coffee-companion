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
import { createTestProviders } from '@/test/providers'
import {
  makeBrewingDevice,
  makeCoffee,
  makeGrinder,
  makeRecentShot,
} from '@/test/factories'

const COFFEE = '00000000-0000-4000-8000-000000000001'
const GRINDER = '00000000-0000-4000-8000-000000000003'
const ESP_DEVICE = '00000000-0000-4000-8000-000000000005'
const AERO_DEVICE = '00000000-0000-4000-8000-000000000004'
const ts = new Date('2026-06-01T08:00:00.000Z')

const mocks = vi.hoisted(() => ({ navigate: vi.fn() }))

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
      type: { id: 't2', userId: null, name: 'Espresso', createdAt: ts, updatedAt: ts },
    }),
    makeBrewingDevice({ id: AERO_DEVICE, name: 'AeroPress Go' }),
  ])
  qc.setQueryData(trpc.espressoShot.getAll.queryKey(), [
    makeRecentShot({
      id: 'shot-1',
      coffeeId: COFFEE,
      grinderId: GRINDER,
      brewingDeviceId: ESP_DEVICE,
      roastDate: '2026-05-01',
    }),
  ])
  return providers
}

const NewEspressoShot = Route.options.component!

describe('NewEspressoShot form', () => {
  it('offers only Espresso-type brewing devices', () => {
    const { Wrapper } = seeded()
    render(<NewEspressoShot />, { wrapper: Wrapper })

    const deviceSelect = screen.getByRole('combobox', { name: 'Brewing Device' })
    expect(
      within(deviceSelect).getByRole('option', { name: 'Linea Mini' }),
    ).toBeTruthy()
    expect(
      within(deviceSelect).queryByRole('option', { name: 'AeroPress Go' }),
    ).toBeNull()
  })

  it('prefills grinder and device from the coffee’s latest shot', () => {
    const { Wrapper } = seeded()
    render(<NewEspressoShot />, { wrapper: Wrapper })

    fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
      target: { value: COFFEE },
    })

    // Prefill selects the grinder + device options (shown by their labels).
    expect(screen.getByDisplayValue('Niche Zero')).toBeTruthy()
    expect(screen.getByDisplayValue('Linea Mini')).toBeTruthy()
  })

  it('submits a create with the entered dose and yield', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response('[]', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
    try {
      const { Wrapper } = seeded()
      render(<NewEspressoShot />, { wrapper: Wrapper })

      fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
        target: { value: COFFEE },
      })
      fireEvent.change(screen.getByPlaceholderText('18.0'), {
        target: { value: '18' },
      })
      fireEvent.change(screen.getByPlaceholderText('36.0'), {
        target: { value: '36' },
      })

      fireEvent.click(screen.getByRole('button', { name: 'Log' }))

      await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
      const [url, init] = fetchSpy.mock.calls[0]
      expect(String(url)).toContain('espressoShot.create')
      const body = String(init?.body ?? '')
      expect(body).toContain('18')
      expect(body).toContain('36')
      expect(body).toContain(COFFEE)
    } finally {
      fetchSpy.mockRestore()
    }
  })
})
