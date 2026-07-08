import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Route } from './$shotId.edit'
import { useFieldContext } from '@/hooks/form-context'
import { createTestProviders } from '@/test/providers'
import {
  makeBrewingDevice,
  makeCoffee,
  makeGrinder,
  makeRecentShot,
} from '@/test/factories'

const SHOT = '00000000-0000-4000-8000-0000000000bb'
const COFFEE = '00000000-0000-4000-8000-000000000001'
const GRINDER = '00000000-0000-4000-8000-000000000003'
const ESP_DEVICE = '00000000-0000-4000-8000-000000000005'
const AERO_DEVICE = '00000000-0000-4000-8000-000000000004'
const ts = new Date('2026-06-01T08:00:00.000Z')

const mocks = vi.hoisted(() => ({ navigate: vi.fn(), shotId: '' }))
mocks.shotId = SHOT

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
  qc.setQueryData(
    trpc.espressoShot.getById.queryKey(SHOT),
    makeRecentShot({
      id: SHOT,
      coffeeId: COFFEE,
      grinderId: GRINDER,
      brewingDeviceId: ESP_DEVICE,
      dose: '18',
      yield: '36',
    }),
  )
  return providers
}

const EditEspressoShot = Route.options.component!

describe('EditEspressoShot form', () => {
  it('offers only Espresso-type brewing devices', () => {
    const { Wrapper } = seeded()
    render(<EditEspressoShot />, { wrapper: Wrapper })

    const deviceSelect = screen.getByRole('combobox', { name: 'Brewing Device' })
    expect(
      within(deviceSelect).getByRole('option', { name: 'Linea Mini' }),
    ).toBeTruthy()
    expect(
      within(deviceSelect).queryByRole('option', { name: 'AeroPress Go' }),
    ).toBeNull()
  })

  it('loads the shot’s existing values into the form', () => {
    const { Wrapper } = seeded()
    render(<EditEspressoShot />, { wrapper: Wrapper })

    // The dose/yield inputs are prefilled from the loaded shot.
    expect(screen.getByDisplayValue('18')).toBeTruthy()
    expect(screen.getByDisplayValue('36')).toBeTruthy()
  })

  it('submits an update carrying the shot id', async () => {
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
      render(<EditEspressoShot />, { wrapper: Wrapper })

      fireEvent.change(screen.getByPlaceholderText('18.0'), {
        target: { value: '19' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
      const [url, init] = fetchSpy.mock.calls[0]
      expect(String(url)).toContain('espressoShot.update')
      const body = String(init?.body ?? '')
      expect(body).toContain(SHOT)
      expect(body).toContain('19')
    } finally {
      fetchSpy.mockRestore()
    }
  })
})
