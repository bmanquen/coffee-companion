import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useFieldContext } from '@/hooks/form-context'
import { createTestProviders } from '@/test/providers'
import { trpcSuccess } from '@/test/trpc-response'
import {
  makeAeropressBrew,
  makeAeropressMethod,
  makeBrewingDevice,
  makeCoffee,
  makeGrinder,
} from '@/test/factories'
import { Route } from './$brewId.edit'

const BREW = '00000000-0000-4000-8000-0000000000aa'
const COFFEE = '00000000-0000-4000-8000-000000000001'
const METHOD = '00000000-0000-4000-8000-000000000002'
const GRINDER = '00000000-0000-4000-8000-000000000003'
const AERO_DEVICE = '00000000-0000-4000-8000-000000000004'
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
  qc.setQueryData(trpc.aeropressMethod.list.queryKey(), [
    makeAeropressMethod({ id: METHOD, name: 'Standard' }),
  ])
  qc.setQueryData(trpc.grinder.list.queryKey(), [
    makeGrinder({ id: GRINDER, name: 'Ode' }),
  ])
  qc.setQueryData(trpc.brewingDevice.list.queryKey(), [
    makeBrewingDevice({ id: AERO_DEVICE, name: 'AeroPress Go' }),
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
  ])
  qc.setQueryData(
    trpc.aeropressBrew.getById.queryKey(BREW),
    makeAeropressBrew({
      id: BREW,
      coffeeId: COFFEE,
      methodId: METHOD,
      grinderId: GRINDER,
      brewingDeviceId: AERO_DEVICE,
      dose: '15',
      water: '220',
      steepTime: 90,
    }),
  )
  return providers
}

const EditAeropressBrew = Route.options.component!

describe('EditAeropressBrew form', () => {
  it('offers only AeroPress-type brewing devices', () => {
    const { Wrapper } = seeded()
    render(<EditAeropressBrew />, { wrapper: Wrapper })

    const deviceSelect = screen.getByRole('combobox', {
      name: 'Brewing Device',
    })
    expect(
      within(deviceSelect).getByRole('option', { name: 'AeroPress Go' }),
    ).toBeTruthy()
    expect(
      within(deviceSelect).queryByRole('option', { name: 'Linea Mini' }),
    ).toBeNull()
  })

  it('loads the brew’s existing values into the form', () => {
    const { Wrapper } = seeded()
    render(<EditAeropressBrew />, { wrapper: Wrapper })

    // The dose/water inputs and Method select are prefilled from the brew.
    expect(screen.getByDisplayValue('15')).toBeTruthy()
    expect(screen.getByDisplayValue('220')).toBeTruthy()
    expect(screen.getByDisplayValue('Standard')).toBeTruthy()
    // 90 seconds is entered as minutes + seconds, not a raw seconds box.
    expect(
      screen.getByLabelText<HTMLInputElement>('Steep Time (minutes)').value,
    ).toBe('1')
    expect(
      screen.getByLabelText<HTMLInputElement>('Steep Time (seconds)').value,
    ).toBe('30')
  })

  it('submits an update carrying the brew id', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(trpcSuccess())
    try {
      const { Wrapper } = seeded()
      render(<EditAeropressBrew />, { wrapper: Wrapper })

      fireEvent.change(screen.getByLabelText(/^Dose/), {
        target: { value: '17' },
      })
      fireEvent.change(screen.getByLabelText('Steep Time (minutes)'), {
        target: { value: '2' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
      const [url, init] = fetchSpy.mock.calls[0]
      expect(String(url)).toContain('aeropressBrew.update')
      const body = String(init?.body ?? '')
      expect(body).toContain(BREW)
      expect(body).toContain('17')
      // 2 minutes + the loaded 30 seconds → 150 whole seconds.
      expect(body).toMatch(/"steepTime":150/)
      await waitFor(() =>
        expect(mocks.navigate).toHaveBeenCalledWith({
          to: '/brews',
          search: { method: 'aeropress' },
        }),
      )
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('starts a new form for another brew id', () => {
    // TanStack Form keeps its first defaultValues, so reusing this form for
    // another brew would show the old brew's values and save them over it.
    const deps = (brewId: string) =>
      JSON.stringify(
        Route.options.remountDeps?.({ params: { brewId } } as never),
      )
    expect(deps('a')).not.toBe(deps('b'))
  })

  it('does not go to Brews when the update lands after the form closed', async () => {
    mocks.navigate.mockClear()
    let answer: (response: Response) => void = () => {}
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          answer = resolve
        }),
    )
    try {
      const { queryClient, Wrapper } = seeded()
      const { unmount } = render(<EditAeropressBrew />, { wrapper: Wrapper })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      await waitFor(() =>
        expect(
          fetchSpy.mock.calls.some(([url]) =>
            String(url).includes('aeropressBrew.update'),
          ),
        ).toBe(true),
      )

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

  it('invalidates dialed-in lookups after save', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(trpcSuccess())
    try {
      const { queryClient, trpc, Wrapper } = seeded()
      const setKey = {
        coffeeId: COFFEE,
        brewingMethod: 'aeropress' as const,
        brewingDeviceId: AERO_DEVICE,
      }
      queryClient.setQueryData(trpc.dialedInBrew.get.queryKey(setKey), [])

      render(<EditAeropressBrew />, { wrapper: Wrapper })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      await waitFor(() => {
        expect(
          queryClient.getQueryState(trpc.dialedInBrew.get.queryKey(setKey))
            ?.isInvalidated,
        ).toBe(true)
      })
    } finally {
      fetchSpy.mockRestore()
    }
  })
})
