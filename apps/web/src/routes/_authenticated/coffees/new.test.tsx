import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Route } from './new'
import { useFieldContext } from '@/hooks/form-context'
import { createTestProviders } from '@/test/providers'
import { trpcSuccess } from '@/test/trpc-response'

const ROASTER = '00000000-0000-4000-8000-000000000001'
const ROAST_LEVEL = '00000000-0000-4000-8000-000000000002'

const mocks = vi.hoisted(() => ({ navigate: vi.fn(), track: vi.fn() }))

vi.mock('@/lib/analytics', () => ({ track: mocks.track }))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
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
  const stamps = { createdAt: new Date(), updatedAt: new Date(), userId: null }
  qc.setQueryData(trpc.roaster.list.queryKey(), [
    { id: ROASTER, name: 'Onyx', ...stamps },
  ])
  qc.setQueryData(trpc.roastLevel.list.queryKey(), [
    { id: ROAST_LEVEL, name: 'Light', ...stamps },
  ])
  qc.setQueryData(trpc.country.list.queryKey(), [])
  qc.setQueryData(trpc.coffeeProcess.getAll.queryKey(), [])
  return providers
}

const NewCoffee = Route.options.component!

describe('NewCoffee', () => {
  it('submits a create and reports the Coffee once it exists', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => Promise.resolve(trpcSuccess([])))
    try {
      const { Wrapper } = seeded()
      render(<NewCoffee />, { wrapper: Wrapper })

      fireEvent.change(screen.getByLabelText(/^Name/), {
        target: { value: 'Ethiopia Guji' },
      })
      fireEvent.change(screen.getByRole('combobox', { name: 'Roaster' }), {
        target: { value: ROASTER },
      })
      fireEvent.change(screen.getByRole('combobox', { name: 'Roast Level' }), {
        target: { value: ROAST_LEVEL },
      })

      expect(mocks.track).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))

      await waitFor(() =>
        expect(
          fetchSpy.mock.calls.some(([url]) =>
            String(url).includes('coffee.create'),
          ),
        ).toBe(true),
      )
      const [, init] = fetchSpy.mock.calls.find(([url]) =>
        String(url).includes('coffee.create'),
      )!
      const body = String(init?.body ?? '')
      expect(body).toContain('Ethiopia Guji')
      expect(body).toContain(ROASTER)
      await waitFor(() =>
        expect(mocks.track).toHaveBeenCalledWith('coffee_created'),
      )
      expect(mocks.navigate).toHaveBeenCalledWith({ to: '/coffees' })
    } finally {
      fetchSpy.mockRestore()
    }
  })
})
