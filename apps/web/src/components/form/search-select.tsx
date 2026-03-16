import { useRef, useState } from 'react'
import { useFieldContext } from '@/hooks/form-context'
import { CheckIcon, ChevronDownIcon, PlusIcon } from 'lucide-react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field'
import { cn } from '@/lib/utils'

export type SearchSelectOption = {
  value: string
  label: string
}

export function SearchSelect({
  label,
  description,
  placeholder = `Select ${label}`,
  options: initialOptions,
  onAddItem,
}: {
  label: string
  description?: string
  placeholder?: string
  options: SearchSelectOption[]
  onAddItem?: (value: string) => SearchSelectOption | Promise<SearchSelectOption>
}) {
  const field = useFieldContext<string>()
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const options = initialOptions

  const selectedOption = options.find((o) => o.value === field.state.value)

  const handleSelect = (value: string) => {
    field.handleChange(value === field.state.value ? '' : value)
    setSearch('')
    setOpen(false)
  }

  const handleAdd = async () => {
    const trimmed = search.trim()
    if (!trimmed) return

    const newOption = onAddItem
      ? await onAddItem(trimmed)
      : { value: trimmed.toLowerCase(), label: trimmed }

    field.handleChange(newOption.value)
    setSearch('')
    setOpen(false)
  }

  const exactMatch = options.some(
    (o) => o.label.toLowerCase() === search.trim().toLowerCase(),
  )

  return (
    <Field>
      <FieldLabel htmlFor={field.name} className="sr-only">
        {label}
      </FieldLabel>
      <FieldContent>
        <div
          ref={containerRef}
          className="relative"
          onBlur={(e) => {
            if (!containerRef.current?.contains(e.relatedTarget)) {
              field.handleBlur()
              setOpen(false)
            }
          }}
        >
          <button
            id={field.name}
            type="button"
            className={cn(
              'flex h-9 w-full cursor-pointer items-center justify-between rounded-md border bg-transparent px-3 py-2 text-sm',
              selectedOption ? 'text-foreground' : 'text-muted-foreground',
            )}
            onClick={() => setOpen(!open)}
          >
            {selectedOption ? selectedOption.label : placeholder}
            <ChevronDownIcon className="size-4 opacity-50" />
          </button>
          {open && (
            <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
              <Command shouldFilter={true}>
                <CommandInput
                  placeholder="Search..."
                  value={search}
                  onValueChange={setSearch}
                  autoFocus
                />
                <CommandList>
                  <CommandEmpty>
                    {search.trim() ? (
                      <button
                        type="button"
                        className="inline-flex cursor-pointer items-center gap-1 text-muted-foreground hover:text-foreground"
                        onMouseDown={(e) => {
                          e.preventDefault()
                          handleAdd()
                        }}
                      >
                        <PlusIcon className="size-4" />
                        Add &ldquo;{search.trim()}&rdquo;
                      </button>
                    ) : (
                      'No results found.'
                    )}
                  </CommandEmpty>
                  <CommandGroup>
                    {options.map((option) => (
                      <CommandItem
                        key={option.value}
                        value={option.label}
                        onSelect={() => handleSelect(option.value)}
                      >
                        <CheckIcon
                          className={cn(
                            'size-4',
                            field.state.value === option.value
                              ? 'opacity-100'
                              : 'opacity-0',
                          )}
                        />
                        {option.label}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  {search.trim() && !exactMatch && options.length > 0 && (
                    <>
                      <CommandSeparator />
                      <CommandGroup>
                        <CommandItem onSelect={handleAdd}>
                          <PlusIcon className="size-4" />
                          Add &ldquo;{search.trim()}&rdquo;
                        </CommandItem>
                      </CommandGroup>
                    </>
                  )}
                </CommandList>
              </Command>
            </div>
          )}
        </div>
        {description && <FieldDescription>{description}</FieldDescription>}
        {field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
          <FieldError>
            {field.state.meta.errors.map((e) => e.message).join(', ')}
          </FieldError>
        )}
      </FieldContent>
    </Field>
  )
}
