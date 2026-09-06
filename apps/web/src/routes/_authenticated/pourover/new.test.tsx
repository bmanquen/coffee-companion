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
  makePouroverBrew,
  makePouroverMethod,
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
const PO_DEVICE = '00000000-0000-4000-8000-000000000004'
const ESP_DEVICE = '00000000-0000-4000-8000-000000000005'
const ts = new Date('2026-06-01T08:00:00.000Z')

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
  // The coffee's most recent brew, used for prefill.
  qc.setQueryData(trpc.pouroverBrew.getAll.queryKey(), [
    makePouroverBrew({
      id: 'brew-1',
      coffeeId: COFFEE,
      methodId: METHOD,
      grinderId: GRINDER,
      brewingDeviceId: PO_DEVICE,
      roastDate: '2026-05-01',
    }),
  ])
  return providers
}

const NewPouroverBrew = Route.options.component!

function fillRequiredRecipe({
  grindSetting = '22',
  brewMinutes,
  brewSeconds,
}: {
  grindSetting?: string
  brewMinutes?: string
  brewSeconds?: string
} = {}) {
  fireEvent.change(screen.getByLabelText(/^Dose/), {
    target: { value: '20' },
  })
  fireEvent.change(screen.getByLabelText(/^Water \(g\)/), {
    target: { value: '340' },
  })
  fireEvent.change(screen.getByLabelText(/^Water Temp/), {
    target: { value: '96' },
  })
  fireEvent.change(screen.getByLabelText(/^Grind Setting/), {
    target: { value: grindSetting },
  })
  if (brewMinutes != null) {
    fireEvent.change(screen.getByLabelText(/^Brew Time \(minutes\)/), {
      target: { value: brewMinutes },
    })
  }
  if (brewSeconds != null) {
    fireEvent.change(screen.getByLabelText(/^Brew Time \(seconds\)/), {
      target: { value: brewSeconds },
    })
  }
}

describe('NewPouroverBrew form', () => {
  it('offers only Pour Over-type brewing devices', () => {
    const { Wrapper } = seeded()
    render(<NewPouroverBrew />, { wrapper: Wrapper })

    const deviceSelect = screen.getByRole('combobox', { name: 'Brewing Device' })
    expect(
      within(deviceSelect).getByRole('option', { name: 'V60' }),
    ).toBeTruthy()
    // The Espresso device is filtered out.
    expect(
      within(deviceSelect).queryByRole('option', { name: 'Linea Mini' }),
    ).toBeNull()
  })

  it('prefills method, grinder, and device from the coffee’s latest brew', () => {
    const { Wrapper } = seeded()
    render(<NewPouroverBrew />, { wrapper: Wrapper })

    fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
      target: { value: COFFEE },
    })

    // Prefill selects the method/grinder/device options (shown by their labels).
    expect(screen.getByDisplayValue('Standard')).toBeTruthy()
    expect(screen.getByDisplayValue('Ode')).toBeTruthy()
    expect(screen.getByDisplayValue('V60')).toBeTruthy()
  })

  it('submits a create with the entered recipe, including water temp', async () => {
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
      render(<NewPouroverBrew />, { wrapper: Wrapper })

      // Select the coffee (prefills the required method/grinder/device uuids).
      fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
        target: { value: COFFEE },
      })
      fillRequiredRecipe({ brewMinutes: '2', brewSeconds: '45' })

      fireEvent.click(screen.getByRole('button', { name: 'Log' }))

      await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
      const [url, init] = fetchSpy.mock.calls[0]
      expect(String(url)).toContain('pouroverBrew.create')
      const body = String(init?.body ?? '')
      expect(body).toContain('20')
      expect(body).toContain('340')
      expect(body).toContain('96')
      expect(body).toMatch(/"brewTime":165/)
      expect(body).toContain(COFFEE)
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('normalizes 165 seconds alone to a brew time of 165', async () => {
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
      render(<NewPouroverBrew />, { wrapper: Wrapper })

      fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
        target: { value: COFFEE },
      })
      fillRequiredRecipe({ brewSeconds: '165' })

      expect(
        screen.getByLabelText<HTMLInputElement>(/^Brew Time \(minutes\)/).value,
      ).toBe('2')
      expect(
        screen.getByLabelText<HTMLInputElement>(/^Brew Time \(seconds\)/).value,
      ).toBe('45')

      fireEvent.click(screen.getByRole('button', { name: 'Log' }))

      await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
      const [url, init] = fetchSpy.mock.calls[0]
      expect(String(url)).toContain('pouroverBrew.create')
      expect(String(init?.body ?? '')).toMatch(/"brewTime":165/)
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('blocks submit when brew time is empty', async () => {
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
      render(<NewPouroverBrew />, { wrapper: Wrapper })

      fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
        target: { value: COFFEE },
      })
      fillRequiredRecipe()
      expect(
        screen.getByLabelText<HTMLInputElement>(/^Brew Time \(minutes\)/).value,
      ).toBe('')
      expect(
        screen.getByLabelText<HTMLInputElement>(/^Brew Time \(seconds\)/).value,
      ).toBe('')

      fireEvent.click(screen.getByRole('button', { name: 'Log' }))

      await waitFor(() => expect(screen.getByRole('button', { name: 'Log' })).toBeTruthy())
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('counts a lone minutes or seconds box as that many minutes or seconds', async () => {
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
      render(<NewPouroverBrew />, { wrapper: Wrapper })

      fireEvent.change(screen.getByRole('combobox', { name: 'Coffee' }), {
        target: { value: COFFEE },
      })
      fillRequiredRecipe({ brewMinutes: '4' })

      fireEvent.click(screen.getByRole('button', { name: 'Log' }))

      await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
      expect(String(fetchSpy.mock.calls[0][1]?.body ?? '')).toMatch(
        /"brewTime":240/,
      )

      fetchSpy.mockClear()
      fireEvent.change(screen.getByLabelText(/^Brew Time \(minutes\)/), {
        target: { value: '' },
      })
      fireEvent.change(screen.getByLabelText(/^Brew Time \(seconds\)/), {
        target: { value: '45' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Log' }))

      await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
      expect(String(fetchSpy.mock.calls[0][1]?.body ?? '')).toMatch(
        /"brewTime":45/,
      )
    } finally {
      fetchSpy.mockRestore()
    }
  })
})
