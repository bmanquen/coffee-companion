import { CheckIcon, ChevronDownIcon } from 'lucide-react'
import { useId, useLayoutEffect, useRef, useState } from 'react'
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
  const triggerRef = useRef<HTMLButtonElement>(null)
  const restoreFocusRef = useRef(false)
  const triggerId = useId()
  const labelId = useId()
  const valueId = useId()

  const selected = brewMethods.find((m) => m.value === selectedMethod)

  const close = (restoreFocus = false) => {
    if (restoreFocus) restoreFocusRef.current = true
    setOpen(false)
    setQuery('')
  }

  useLayoutEffect(() => {
    if (open || !restoreFocusRef.current) return
    restoreFocusRef.current = false
    triggerRef.current?.focus()
  }, [open])

  const handleSelect = (next: BrewMethod) => {
    onSelectMethod(next)
    close(true)
  }

  return (
    <div className="flex w-full flex-col gap-2 sm:w-72">
      <Label id={labelId} htmlFor={triggerId}>
        Brewing method
      </Label>
      <div
        ref={containerRef}
        className="relative w-full"
        onBlur={(e) => {
          if (!containerRef.current?.contains(e.relatedTarget)) {
            close()
          }
        }}
        onKeyDownCapture={(e) => {
          if (e.key !== 'Escape' || !open) return
          e.preventDefault()
          e.stopPropagation()
          close(true)
        }}
      >
        <button
          ref={triggerRef}
          id={triggerId}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-labelledby={`${labelId} ${valueId}`}
          className="flex h-9 w-full cursor-pointer items-center justify-between rounded-md border bg-transparent px-3 py-2 text-sm font-medium text-foreground"
          onClick={() => (open ? close() : setOpen(true))}
        >
          <span id={valueId}>{selected?.label}</span>
          <ChevronDownIcon className="size-4 opacity-50" />
        </button>
        {open && (
          <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
            <Command>
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
