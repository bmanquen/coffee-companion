import { CheckIcon, ChevronDownIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'

export type CoffeeFilterOption = {
  value: string
  label: string
}

/**
 * Standalone coffee picker used to filter list pages. Mirrors the look of the
 * form `SearchSelect` but is not bound to a form field. An empty `value` means
 * "All coffees" (no filter).
 */
export function CoffeeFilter({
  options,
  value,
  onChange,
}: {
  options: Array<CoffeeFilterOption>
  value: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const selected = options.find((o) => o.value === value)

  const handleSelect = (next: string) => {
    onChange(next === value ? '' : next)
    setOpen(false)
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full sm:w-64"
      onBlur={(e) => {
        if (!containerRef.current?.contains(e.relatedTarget)) {
          setOpen(false)
        }
      }}
    >
      <button
        type="button"
        className={cn(
          'flex h-9 w-full cursor-pointer items-center justify-between rounded-md border bg-transparent px-3 py-2 text-sm',
          selected ? 'text-foreground' : 'text-muted-foreground',
        )}
        onClick={() => setOpen(!open)}
      >
        {selected ? selected.label : 'All coffees'}
        <ChevronDownIcon className="size-4 opacity-50" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
          <Command>
            <CommandInput placeholder="Search coffees..." autoFocus />
            <CommandList>
              <CommandEmpty>No coffees found.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="All coffees"
                  onSelect={() => handleSelect('')}
                >
                  <CheckIcon
                    className={cn(
                      'size-4',
                      value === '' ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  All coffees
                </CommandItem>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    onSelect={() => handleSelect(option.value)}
                  >
                    <CheckIcon
                      className={cn(
                        'size-4',
                        value === option.value ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      )}
    </div>
  )
}
