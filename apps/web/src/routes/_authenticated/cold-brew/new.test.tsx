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
  makeColdBrewBrew,
  makeGrinder,
} from '@/test/factories'

const mocks = vi.hoisted(() => ({ navigate: vi.fn() }))

// The form is a route component: stub createFileRoute so `Route.options.component`
// is the plain component, and useNavigate so the submit handler doesn't need a router.
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => ({
    options,
    useParams: () => mocks,
  }),
  useNavigate: () => mocks.navigate,
}))

// Swap the cmdk/Radix SearchSelect for a native <select> so options and value
// changes are trivially testable (real cmdk needs browser-only APIs).
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

// Field values are validated as UUIDs, so the fixtures use real UUID ids.
const COFFEE = '00000000-0000-4000-8000-000000000001'
const GRINDER = '00000000-0000-4000-8000-000000000003'
const CB_DEVICE = '00000000-0000-4000-8000-000000000004'
const ESP_DEVICE = '00000000-0000-4000-8000-000000000005'
const ts = new Date('2026-06-01T08:00:00.000Z')

function seeded() {
  const providers = createTestProviders()
  const { queryClient: qc, trpc } = providers
  qc.setQueryData(trpc.coffee.getAll.queryKey(), [
    makeCoffee({ id: COFFEE, name: 'Ethiopia Guji' }),
  ])
  qc.setQueryData(trpc.grinder.list.queryKey(), [
    makeGrinder({ id: GRINDER, name: 'Ode' }),
  ])
  qc.setQueryData(trpc.brewingDevice.list.queryKey(), [
    makeBrewingDevice({
      id: CB_DEVICE,
      name: 'Toddy',
      brand: 'Toddy',
      type: { id: 't5', userId: null, name: 'Cold Brew', createdAt: ts, updatedAt: ts },
    }),
    makeBrewingDevice({
      id: ESP_DEVICE,
      name: 'Linea Mini',
      type: { id: 't2', userId: null, name: 'Espresso', createdAt: ts, updatedAt: ts },
    }),
  ])
  // The coffee's most recent brew, used for prefill.
  qc.setQueryData(trpc.coldBrewBrew.getAll.queryKey(), [
    makeColdBrewBrew({
      id: 'brew-1',
      coffeeId: COFFEE,
      grinderId: GRINDER,
      brewingDeviceId: CB_DEVICE,
      roastDate: '2026-05-01',
    }),
  ])
  return providers
}

const NewColdBrewBrew = Route.options.component!

describe('NewColdBrewBrew form', () => {
  it('offers only Cold Brew-type brewing devices', () => {
    const { Wrapper } = seeded()
    render(<NewColdBrewBrew />, { wrapper: Wrapper })

    const deviceSelect = screen.getByRole('combobox', { name: 'Brewing Device' })
    expect(
      within(deviceSelect).getByRole('option', { name: 'Toddy' }),
    ).toBeTruthy()
    // The Espresso device is filtered out.
    expect(
      within(deviceSelect).queryByRole('option', { name: 'Linea Mini' }),
    ).toBeNull()
  })

  it('has no method picker (cold brew is methodless)', () => {
    const { Wrapper } = seeded()
    render(<NewColdBrewBrew />, { wrapper: Wrapper })

    expect(screen.queryByRole('combobox', { name: 'Method' })).toBeNull()
  })

  it('prefills grinder and device from the coffee’s latest brew', () => {
    const { Wrapper } = seeded()
    render(<NewColdBrewBrew />, { wrapper: Wrapper })

    fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
      target: { value: COFFEE },
    })

    expect(screen.getByDisplayValue('Ode')).toBeTruthy()
    expect(screen.getByDisplayValue('Toddy')).toBeTruthy()
  })

  it('submits a create with the entered recipe, converting steep hours to minutes', async () => {
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
      render(<NewColdBrewBrew />, { wrapper: Wrapper })

      // Select the coffee (prefills the required grinder/device uuids).
      fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
        target: { value: COFFEE },
      })
      fireEvent.change(screen.getByPlaceholderText('50.0'), {
        target: { value: '55' },
      })
      fireEvent.change(screen.getByPlaceholderText('500'), {
        target: { value: '520' },
      })
      // 18 hours -> 1080 minutes.
      fireEvent.change(screen.getByLabelText('Steep Time (hours)'), {
        target: { value: '18' },
      })
      fireEvent.change(screen.getByRole('combobox', { name: 'Brew Environment' }), {
        target: { value: 'Fridge' },
      })

      fireEvent.click(screen.getByRole('button', { name: 'Log' }))

      await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
      const [url, init] = fetchSpy.mock.calls[0]
      expect(String(url)).toContain('coldBrewBrew.create')
      const body = String(init?.body ?? '')
      expect(body).toContain('55')
      expect(body).toContain('520')
      expect(body).toContain('1080')
      expect(body).toContain('Fridge')
      expect(body).toContain(COFFEE)
    } finally {
      fetchSpy.mockRestore()
    }
  })
})
