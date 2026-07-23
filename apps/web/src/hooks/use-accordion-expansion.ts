import { useState } from 'react'
import type { ExpandedState, OnChangeFn } from '@tanstack/react-table'

// Controlled row-expansion state that behaves as an accordion: opening one row
// collapses whichever was open. TanStack's installed types don't expose an
// `enableMultiRowExpansion` option, so we enforce single-open ourselves —
// keeping only the newly-opened row id. Spread the result into useReactTable:
//   const expansion = useAccordionExpansion()
//   useReactTable({ ..., state: { expanded: expansion.expanded },
//     onExpandedChange: expansion.onExpandedChange, getExpandedRowModel: ... })
export function useAccordionExpansion(): {
  expanded: ExpandedState
  onExpandedChange: OnChangeFn<ExpandedState>
} {
  const [expanded, setExpanded] = useState<ExpandedState>({})

  const onExpandedChange: OnChangeFn<ExpandedState> = (updater) => {
    setExpanded((old) => {
      const next = typeof updater === 'function' ? updater(old) : updater
      // We never set `true` (expand-all) ourselves, so both are objects here.
      const openKeys = (state: ExpandedState) =>
        state === true
          ? []
          : Object.keys(state).filter((key) => (state)[key])
      const before = openKeys(old)
      const after = openKeys(next)
      const newlyOpened = after.find((key) => !before.includes(key))
      return newlyOpened ? { [newlyOpened]: true } : {}
    })
  }

  return { expanded, onExpandedChange }
}
