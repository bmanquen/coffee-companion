import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AeropressBrewFeed } from './aeropress-brew-feed'
import type * as ReactRouter from '@tanstack/react-router'
import { createTestProviders } from '@/test/providers'
import { makeAeropressBrew, makeRecentCoffee } from '@/test/factories'

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

describe('AeropressBrewFeed', () => {
  it('formats steep time as minutes and seconds on the table and card', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(trpc.aeropressBrew.getAll.queryKey(), [
      makeAeropressBrew({
        id: 'a1',
        coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
        coffeeId: 'c1',
        steepTime: 90,
      }),
      makeAeropressBrew({
        id: 'a2',
        coffee: makeRecentCoffee({ id: 'c2', name: 'Colombia Huila' }),
        coffeeId: 'c2',
        steepTime: 120,
      }),
      makeAeropressBrew({
        id: 'a3',
        coffee: makeRecentCoffee({ id: 'c3', name: 'Kenya AA' }),
        coffeeId: 'c3',
        steepTime: 45,
      }),
      makeAeropressBrew({
        id: 'a4',
        coffee: makeRecentCoffee({ id: 'c4', name: 'Brazil Cerrado' }),
        coffeeId: 'c4',
        steepTime: null,
      }),
    ])

    const { container } = render(<AeropressBrewFeed />, { wrapper: Wrapper })

    const table = within(screen.getByRole('table'))
    expect(table.getByText('1m 30s')).toBeTruthy()
    expect(table.getByText('2m')).toBeTruthy()
    expect(table.getByText('45s')).toBeTruthy()
    expect(
      within(table.getByText('Brazil Cerrado').closest('tr')!).getByText('-'),
    ).toBeTruthy()

    const cards = container.querySelector<HTMLElement>('.lg\\:hidden')!
    expect(within(cards).getByText('1m 30s')).toBeTruthy()
    expect(within(cards).getByText('2m')).toBeTruthy()
    expect(within(cards).getByText('45s')).toBeTruthy()
    const noneCard = within(cards)
      .getByText('Brazil Cerrado')
      .closest('.rounded-lg') as HTMLElement
    const steepStat = within(noneCard)
      .getByText('Steep')
      .closest('div') as HTMLElement
    expect(within(steepStat).getByText('-')).toBeTruthy()
  })
})
