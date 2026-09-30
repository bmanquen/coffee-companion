import { createColumnHelper } from '@tanstack/react-table'
import { formatBrewRatio } from '@/lib/brew'

// Computed 1:x as its own summary piece — derived, never stored, never typed.
export function ratioColumn<T extends { dose: string | null }>(
  output: (row: T) => string | null,
) {
  return createColumnHelper<T>().display({
    id: 'ratio',
    header: '',
    cell: (info) =>
      formatBrewRatio(info.row.original.dose, output(info.row.original)),
    enableSorting: false,
    meta: { cardSummary: true },
  })
}
