import { render, screen, within } from '@testing-library/react'
import { createColumnHelper } from '@tanstack/react-table'
import { describe, expect, it, vi } from 'vitest'
import { RecentBrewsCard } from './recent-brews-card'
import type * as ReactRouter from '@tanstack/react-router'

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

type Brew = { id: string; isDialedIn: boolean; coffee: { name: string } }
const columnHelper = createColumnHelper<Brew>()
const columns = [
  columnHelper.accessor((r) => r.coffee.name, {
    id: 'coffee',
    header: 'Coffee',
  }),
]

const base = {
  title: 'Recent Test',
  newTo: '/espresso/new' as const,
  logLabel: 'Log Test',
  emptyMessage: 'No tests yet.',
  emptyLinkLabel: 'Log your first test',
  page: 0,
  onPageChange: () => {},
  pageSize: 5,
  columns,
  renderDetails: () => null,
}

describe('RecentBrewsCard', () => {
  it('shows the empty state when there are no items', () => {
    render(
      <RecentBrewsCard
        {...base}
        query={{
          data: { items: [], total: 0 },
          isLoading: false,
          isPlaceholderData: false,
        }}
      />,
    )
    expect(screen.getByText(/No tests yet/i)).toBeTruthy()
  })

  it('renders rows and links the header to the new-brew form', () => {
    render(
      <RecentBrewsCard
        {...base}
        query={{
          data: {
            items: [
              { id: '1', isDialedIn: false, coffee: { name: 'Ethiopia Guji' } },
            ],
            total: 1,
          },
          isLoading: false,
          isPlaceholderData: false,
        }}
      />,
    )
    expect(
      within(screen.getByRole('table')).getByText('Ethiopia Guji'),
    ).toBeTruthy()
    const logAnchor = screen
      .getByRole('button', { name: 'Log Test' })
      .closest('a')
    expect(logAnchor?.getAttribute('href')).toBe('/espresso/new')
  })

  it('shows a spinner while the first page is loading', () => {
    const { container } = render(
      <RecentBrewsCard
        {...base}
        query={{ data: undefined, isLoading: true, isPlaceholderData: false }}
      />,
    )
    expect(container.querySelector('.animate-spin')).toBeTruthy()
  })
})
