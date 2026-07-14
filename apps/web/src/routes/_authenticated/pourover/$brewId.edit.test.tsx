import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Route } from './$brewId.edit'
import { useFieldContext } from '@/hooks/form-context'
import { createTestProviders } from '@/test/providers'
import {
  makeBrewingDevice,
  makeCoffee,
  makeGrinder,
  makePouroverBrew,
  makePouroverMethod,
} from '@/test/factories'

const BREW = '00000000-0000-4000-8000-0000000000aa'
const COFFEE = '00000000-0000-4000-8000-000000000001'
const METHOD = '00000000-0000-4000-8000-000000000002'
const GRINDER = '00000000-0000-4000-8000-000000000003'
const PO_DEVICE = '00000000-0000-4000-8000-000000000004'
const ESP_DEVICE = '00000000-0000-4000-8000-000000000005'
const ts = new Date('2026-06-01T08:00:00.000Z')

const mocks = vi.hoisted(() => ({ navigate: vi.fn(), brewId: '' }))
mocks.brewId = BREW

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
  qc.setQueryData(trpc.pouroverMethod.list.queryKey(), [
    makePouroverMethod({ id: METHOD, name: 'Standard' }),
  ])
  qc.setQueryData(trpc.grinder.list.queryKey(), [
    makeGrinder({ id: GRINDER, name: 'Ode' }),
  ])
  qc.setQueryData(trpc.brewingDevice.list.queryKey(), [
    makeBrewingDevice({
      id: PO_DEVICE,
      name: 'V60',
      brand: 'Hario',
      type: { id: 't3', userId: null, name: 'Pour Over', createdAt: ts, updatedAt: ts },
    }),
    makeBrewingDevice({
      id: ESP_DEVICE,
      name: 'Linea Mini',
      type: { id: 't2', userId: null, name: 'Espresso', createdAt: ts, updatedAt: ts },
    }),
  ])
  qc.setQueryData(
    trpc.pouroverBrew.getById.queryKey(BREW),
    makePouroverBrew({
      id: BREW,
      coffeeId: COFFEE,
      methodId: METHOD,
      grinderId: GRINDER,
      brewingDeviceId: PO_DEVICE,
      dose: '18',
      water: '300',
      brewTime: 165,
      waterTemp: 94,
    }),
  )
  return providers
}

const EditPouroverBrew = Route.options.component!

describe('EditPouroverBrew form', () => {
  it('offers only Pour Over-type brewing devices', () => {
    const { Wrapper } = seeded()
    render(<EditPouroverBrew />, { wrapper: Wrapper })

    const deviceSelect = screen.getByRole('combobox', { name: 'Brewing Device' })
    expect(
      within(deviceSelect).getByRole('option', { name: 'V60' }),
    ).toBeTruthy()
    expect(
      within(deviceSelect).queryByRole('option', { name: 'Linea Mini' }),
    ).toBeNull()
  })

  it('loads the brew’s existing values into the form', () => {
    const { Wrapper } = seeded()
    render(<EditPouroverBrew />, { wrapper: Wrapper })

    // The dose/water/temp inputs and Method select are prefilled from the brew.
    expect(screen.getByDisplayValue('18')).toBeTruthy()
    expect(screen.getByDisplayValue('300')).toBeTruthy()
    expect(screen.getByDisplayValue('94')).toBeTruthy()
    expect(screen.getByDisplayValue('Standard')).toBeTruthy()
  })

  it('submits an update carrying the brew id', async () => {
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
      render(<EditPouroverBrew />, { wrapper: Wrapper })

      fireEvent.change(screen.getByPlaceholderText('18.0'), {
        target: { value: '19' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
      const [url, init] = fetchSpy.mock.calls[0]
      expect(String(url)).toContain('pouroverBrew.update')
      const body = String(init?.body ?? '')
      expect(body).toContain(BREW)
      expect(body).toContain('19')
    } finally {
      fetchSpy.mockRestore()
    }
  })
})
