import { CheckIcon, ChevronDownIcon, PlusIcon } from 'lucide-react'
import { useState } from 'react'
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useFieldContext } from '@/hooks/form-context'
import { cn } from '@/lib/utils'

export type SearchSelectOption = {
  value: string
  label: string
}

export function SearchSelect({
  label,
  showLabel = true,
  description,
  placeholder = `Select ${label}`,
  options: initialOptions,
  onAddItem,
  disabled = false,
}: {
  label: string
  showLabel?: boolean
  description?: string
  placeholder?: string
  options: Array<SearchSelectOption>
  onAddItem?: (
    value: string,
  ) => SearchSelectOption | Promise<SearchSelectOption>
  disabled?: boolean
}) {
  const field = useFieldContext<string>()
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
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
      <FieldLabel
        htmlFor={field.name}
        className={showLabel ? undefined : 'sr-only'}
      >
        {label}
      </FieldLabel>
      <FieldContent>
        <Popover
          open={open}
          onOpenChange={(next) => {
            setOpen(next)
            if (!next) {
              setSearch('')
              field.handleBlur()
            }
          }}
        >
          <PopoverTrigger asChild>
            <button
              id={field.name}
              type="button"
              className={cn(
                'flex h-9 w-full items-center justify-between rounded-md border bg-transparent px-3 py-2 text-sm',
                disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
                selectedOption ? 'text-foreground' : 'text-muted-foreground',
              )}
              disabled={disabled}
            >
              {selectedOption ? selectedOption.label : placeholder}
              <ChevronDownIcon className="size-4 opacity-50" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            side="bottom"
            avoidCollisions={false}
            className="w-[var(--radix-popover-trigger-width)] p-0"
          >
            <Command shouldFilter={true}>
              <CommandInput
                placeholder="Search..."
                value={search}
                onValueChange={setSearch}
              />
              <CommandList>
                <CommandEmpty>
                  {search.trim() && onAddItem ? (
                    <button
                      type="button"
                      className="inline-flex cursor-pointer items-center gap-1 text-muted-foreground hover:text-foreground"
                      onClick={handleAdd}
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
                {search.trim() &&
                  !exactMatch &&
                  onAddItem &&
                  options.length > 0 && (
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
          </PopoverContent>
        </Popover>
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
