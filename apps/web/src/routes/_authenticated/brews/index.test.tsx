import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Brews, Route } from './index'
import type * as ReactRouter from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { seedCoffees, seedEspressoShotPage } from '@/test/espresso-shots'
import {
  makeAeropressBrew,
  makeCoffee,
  makeRecentShot,
} from '@/test/factories'
import { createTestProviders } from '@/test/providers'

// Link needs router context; swap it for a plain anchor for unit rendering.
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouter>()
  return {
    ...actual,
    Link: ({
      to,
      children,
      ...props
    }: {
      to: string
      children: React.ReactNode
    }) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  }
})

// cmdk needs a browser; the select's own open/close/select is covered in
// brews-method-select.test.tsx. Here we only need options to be clickable.
vi.mock('@/components/ui/command', () => ({
  Command: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandGroup: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  CommandEmpty: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  CommandInput: ({ placeholder }: { placeholder?: string }) => (
    <input placeholder={placeholder} />
  ),
  CommandItem: ({
    children,
    onSelect,
  }: {
    children: ReactNode
    onSelect?: () => void
  }) => (
    <div role="option" onClick={() => onSelect?.()}>
      {children}
    </div>
  ),
}))

function seeded() {
  const providers = createTestProviders()
  seedEspressoShotPage(providers.queryClient, providers.trpc, [makeRecentShot()])
  seedCoffees(providers.queryClient, providers.trpc, [
    makeCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
  ])
  providers.queryClient.setQueryData(
    providers.trpc.aeropressBrew.getAll.queryKey(),
    [makeAeropressBrew()],
  )
  return providers
}

function renderBrews(
  selectedMethod: 'espresso' | 'aeropress' = 'espresso',
  onSelectMethod = vi.fn(),
) {
  const { Wrapper } = seeded()
  render(
    <Brews selectedMethod={selectedMethod} onSelectMethod={onSelectMethod} />,
    { wrapper: Wrapper },
  )
  return { onSelectMethod }
}

describe('Brews method select', () => {
  it('shows the labelled select and the Espresso log by default', () => {
    renderBrews()

    expect(screen.getByLabelText('Brewing method')).toBeTruthy()
    expect(screen.queryByRole('tab')).toBeNull()
    expect(screen.queryByRole('tablist')).toBeNull()

    expect(screen.getByText('Log Shot')).toBeTruthy()
    expect(screen.queryByText('Log Brew')).toBeNull()
  })

  it('switches to the AeroPress log when that method is selected', () => {
    const { onSelectMethod } = renderBrews()

    fireEvent.click(screen.getByLabelText('Brewing method'))
    fireEvent.click(screen.getByRole('option', { name: 'AeroPress' }))

    expect(onSelectMethod).toHaveBeenCalledWith('aeropress')
  })

  it('renders the AeroPress log when that method is the selection', () => {
    renderBrews('aeropress')

    expect(screen.getByText('Log Brew')).toBeTruthy()
    expect(screen.queryByText('Log Shot')).toBeNull()
  })
})

describe('Brews loader', () => {
  it('keeps loading the route when coffee.getAll rejects', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Network request failed'))
    const rejections: Array<unknown> = []
    const onUnhandled = (reason: unknown) => {
      rejections.push(reason)
    }
    process.on('unhandledRejection', onUnhandled)
    try {
      const { queryClient, trpc } = createTestProviders()
      const loader = Route.options.loader
      expect(loader).toBeTypeOf('function')
      expect(
        loader?.({
          context: { queryClient, trpc },
        } as never),
      ).toBeUndefined()
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(rejections).toEqual([])
    } finally {
      process.off('unhandledRejection', onUnhandled)
      fetchSpy.mockRestore()
    }
  })
})
