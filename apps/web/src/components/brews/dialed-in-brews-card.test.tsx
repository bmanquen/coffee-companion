import { render, screen, within } from '@testing-library/react'
import { createColumnHelper } from '@tanstack/react-table'
import { describe, expect, it } from 'vitest'
import { DialedInBrewsCard } from './dialed-in-brews-card'

type Brew = { id: string; coffee: { name: string } }
const columnHelper = createColumnHelper<Brew>()
const columns = [
  columnHelper.accessor((r) => r.coffee.name, {
    id: 'coffee',
    header: 'Coffee',
  }),
]

describe('DialedInBrewsCard', () => {
  it('renders nothing when there are no rows', () => {
    const { container } = render(
      <DialedInBrewsCard
        title="Dialed In Test"
        data={[]}
        columns={columns}
        renderDetails={() => null}
      />,
    )
    expect(container.firstChild).toBeNull()
    expect(screen.queryByText('Dialed In Test')).toBeNull()
  })

  it('renders the title and a row per brew', () => {
    render(
      <DialedInBrewsCard
        title="Dialed In Test"
        data={[{ id: '1', coffee: { name: 'Ethiopia Guji' } }]}
        columns={columns}
        renderDetails={() => null}
      />,
    )
    expect(screen.getByText('Dialed In Test')).toBeTruthy()
    expect(
      within(screen.getByRole('table')).getByText('Ethiopia Guji'),
    ).toBeTruthy()
  })
})
