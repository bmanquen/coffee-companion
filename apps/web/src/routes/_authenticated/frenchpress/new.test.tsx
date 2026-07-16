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
  makeFrenchpressBrew,
  makeFrenchpressMethod,
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
const METHOD = '00000000-0000-4000-8000-000000000002'
const GRINDER = '00000000-0000-4000-8000-000000000003'
const FP_DEVICE = '00000000-0000-4000-8000-000000000004'
const ESP_DEVICE = '00000000-0000-4000-8000-000000000005'
const ts = new Date('2026-06-01T08:00:00.000Z')

function seeded() {
  const providers = createTestProviders()
  const { queryClient: qc, trpc } = providers
  qc.setQueryData(trpc.coffee.getAll.queryKey(), [
    makeCoffee({ id: COFFEE, name: 'Ethiopia Guji' }),
  ])
  qc.setQueryData(trpc.frenchpressMethod.list.queryKey(), [
    makeFrenchpressMethod({ id: METHOD, name: 'Standard' }),
  ])
  qc.setQueryData(trpc.grinder.list.queryKey(), [
    makeGrinder({ id: GRINDER, name: 'Ode' }),
  ])
  qc.setQueryData(trpc.brewingDevice.list.queryKey(), [
    makeBrewingDevice({
      id: FP_DEVICE,
      name: 'Chambord',
      brand: 'Bodum',
      type: { id: 't4', userId: null, name: 'French Press', createdAt: ts, updatedAt: ts },
    }),
    makeBrewingDevice({
      id: ESP_DEVICE,
      name: 'Linea Mini',
      type: { id: 't2', userId: null, name: 'Espresso', createdAt: ts, updatedAt: ts },
    }),
  ])
  // The coffee's most recent brew, used for prefill.
  qc.setQueryData(trpc.frenchpressBrew.getAll.queryKey(), [
    makeFrenchpressBrew({
      id: 'brew-1',
      coffeeId: COFFEE,
      methodId: METHOD,
      grinderId: GRINDER,
      brewingDeviceId: FP_DEVICE,
      roastDate: '2026-05-01',
    }),
  ])
  return providers
}

const NewFrenchpressBrew = Route.options.component!

describe('NewFrenchpressBrew form', () => {
  it('offers only French Press-type brewing devices', () => {
    const { Wrapper } = seeded()
    render(<NewFrenchpressBrew />, { wrapper: Wrapper })

    const deviceSelect = screen.getByRole('combobox', { name: 'Brewing Device' })
    expect(
      within(deviceSelect).getByRole('option', { name: 'Chambord' }),
    ).toBeTruthy()
    // The Espresso device is filtered out.
    expect(
      within(deviceSelect).queryByRole('option', { name: 'Linea Mini' }),
    ).toBeNull()
  })

  it('prefills method, grinder, and device from the coffee’s latest brew', () => {
    const { Wrapper } = seeded()
    render(<NewFrenchpressBrew />, { wrapper: Wrapper })

    fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
      target: { value: COFFEE },
    })

    // Prefill selects the method/grinder/device options (shown by their labels).
    expect(screen.getByDisplayValue('Standard')).toBeTruthy()
    expect(screen.getByDisplayValue('Ode')).toBeTruthy()
    expect(screen.getByDisplayValue('Chambord')).toBeTruthy()
  })

  it('submits a create with the entered recipe, including steep time and water temp', async () => {
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
      render(<NewFrenchpressBrew />, { wrapper: Wrapper })

      // Select the coffee (prefills the required method/grinder/device uuids).
      fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
        target: { value: COFFEE },
      })
      fireEvent.change(screen.getByPlaceholderText('30.0'), {
        target: { value: '32' },
      })
      fireEvent.change(screen.getByPlaceholderText('500'), {
        target: { value: '520' },
      })
      fireEvent.change(screen.getByPlaceholderText('240'), {
        target: { value: '300' },
      })
      fireEvent.change(screen.getByPlaceholderText('95'), {
        target: { value: '96' },
      })

      fireEvent.click(screen.getByRole('button', { name: 'Log' }))

      await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
      const [url, init] = fetchSpy.mock.calls[0]
      expect(String(url)).toContain('frenchpressBrew.create')
      const body = String(init?.body ?? '')
      expect(body).toContain('32')
      expect(body).toContain('520')
      expect(body).toContain('300')
      expect(body).toContain('96')
      expect(body).toContain(COFFEE)
    } finally {
      fetchSpy.mockRestore()
    }
  })
})
