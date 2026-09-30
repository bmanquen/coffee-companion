import { createColumnHelper } from '@tanstack/react-table'
import { formatBrewRatio } from '@/lib/brew'

// Computed 1:x as its own summary piece — derived, never stored, never typed.
export function ratioColumn<T extends { dose: string | null }>(
  output: (row: T) => string | null,
) {
  return createColumnHelper<T>().accessor(
    (row) => formatBrewRatio(row.dose, output(row)),
    {
      id: 'ratio',
      header: 'Ratio',
      cell: (info) => info.getValue(),
      enableSorting: false,
      meta: { cardSummary: true, cardSummaryLabel: true, cardSkipEmpty: true },
    },
  )
}
