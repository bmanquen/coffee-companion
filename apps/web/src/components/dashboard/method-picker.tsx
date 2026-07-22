import { CheckIcon, ChevronDownIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { formatLastBrewed, methodPickerItems } from './methods'
import type { DashboardMethod, MethodFeed } from './methods'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'

// The dashboard's method switcher: a single dropdown listing every Brewing
// Method alphabetically, each row showing when it was last brewed (or "No brews
// yet"). Fixed footprint at any number of methods, so it scales where a tab row
// wouldn't. Mirrors CoffeeFilter's button + Command dropdown, which gives the
// listbox keyboard/screen-reader behaviour for free.
export function MethodPicker({
  selectedMethod,
  onSelectMethod,
  feeds,
  now,
}: {
  selectedMethod: DashboardMethod
  onSelectMethod: (method: DashboardMethod) => void
  feeds: Array<MethodFeed>
  now: Date
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const items = methodPickerItems(feeds)
  const selected = items.find((i) => i.method === selectedMethod)

  const handleSelect = (next: DashboardMethod) => {
    onSelectMethod(next)
    setOpen(false)
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full sm:w-72"
      onBlur={(e) => {
        if (!containerRef.current?.contains(e.relatedTarget)) {
          setOpen(false)
        }
      }}
    >
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-9 w-full cursor-pointer items-center justify-between rounded-md border bg-transparent px-3 py-2 text-sm font-medium text-foreground"
        onClick={() => setOpen(!open)}
      >
        {selected?.label}
        <ChevronDownIcon className="size-4 opacity-50" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
          <Command>
            {/* The autofocused input moves focus into the Command on open, so
                cmdk's arrow-key/Enter/Escape handling (bound to the Command
                root) works — and it doubles as type-to-filter. Mirrors
                CoffeeFilter. */}
            <CommandInput placeholder="Search methods..." autoFocus />
            <CommandList>
              <CommandEmpty>No methods found.</CommandEmpty>
              <CommandGroup>
                {items.map((item) => {
                  const isActive = item.method === selectedMethod
                  return (
                    <CommandItem
                      key={item.method}
                      value={item.label}
                      onSelect={() => handleSelect(item.method)}
                    >
                      <CheckIcon
                        className={cn(
                          'size-4',
                          isActive ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      <span className="flex-1">{item.label}</span>
                      <span
                        className={cn(
                          'text-xs',
                          item.lastBrewedAt === null
                            ? 'text-muted-foreground/60'
                            : 'text-muted-foreground',
                        )}
                      >
                        {formatLastBrewed(item.lastBrewedAt, now)}
                      </span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      )}
    </div>
  )
}
