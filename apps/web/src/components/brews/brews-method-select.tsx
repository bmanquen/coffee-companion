import { CheckIcon, ChevronDownIcon } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { brewMethods } from './methods'
import type { BrewMethod } from './methods'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

// Searchable method switcher for /brews. Same Command dropdown as the
// dashboard MethodPicker and CoffeeFilter; labelled so the control has a name
// that is not the current method, and without last-brewed times — this page
// only needs to pick which log is showing.
export function BrewsMethodSelect({
  selectedMethod,
  onSelectMethod,
}: {
  selectedMethod: BrewMethod
  onSelectMethod: (method: BrewMethod) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerId = useId()

  const selected = brewMethods.find((m) => m.value === selectedMethod)

  const close = () => {
    setOpen(false)
    setQuery('')
  }

  const handleSelect = (next: BrewMethod) => {
    onSelectMethod(next)
    close()
  }

  return (
    <div className="flex w-full flex-col gap-2 sm:w-72">
      <Label htmlFor={triggerId}>Brewing method</Label>
      <div
        ref={containerRef}
        className="relative w-full"
        onBlur={(e) => {
          if (!containerRef.current?.contains(e.relatedTarget)) {
            close()
          }
        }}
      >
        <button
          id={triggerId}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          className="flex h-9 w-full cursor-pointer items-center justify-between rounded-md border bg-transparent px-3 py-2 text-sm font-medium text-foreground"
          onClick={() => (open ? close() : setOpen(true))}
        >
          {selected?.label}
          <ChevronDownIcon className="size-4 opacity-50" />
        </button>
        {open && (
          <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
            <Command>
              {/* Autofocus moves focus into Command so cmdk's
                  arrow/Enter/Escape handling works, and doubles as type-to-filter. */}
              <CommandInput
                placeholder="Search methods"
                value={query}
                onValueChange={setQuery}
                autoFocus
              />
              <CommandList>
                <CommandEmpty>No methods match “{query}”.</CommandEmpty>
                <CommandGroup>
                  {brewMethods.map((method) => {
                    const isActive = method.value === selectedMethod
                    return (
                      <CommandItem
                        key={method.value}
                        value={method.label}
                        onSelect={() => handleSelect(method.value)}
                      >
                        <CheckIcon
                          className={cn(
                            'size-4',
                            isActive ? 'opacity-100' : 'opacity-0',
                          )}
                        />
                        {method.label}
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </div>
        )}
      </div>
    </div>
  )
}
