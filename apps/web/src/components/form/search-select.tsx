import { useState } from 'react'
import { useFieldContext } from '@/hooks/form-context'
import { CheckIcon, PlusIcon } from 'lucide-react'
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
  placeholder = 'Search...',
  options: initialOptions,
  onAddItem,
}: {
  label: string
  description?: string
  placeholder?: string
  options: SearchSelectOption[]
  onAddItem?: (value: string) => SearchSelectOption
}) {
  const field = useFieldContext<string>()
  const [search, setSearch] = useState('')
  const [options, setOptions] = useState(initialOptions)

  const selectedOption = options.find((o) => o.value === field.state.value)

  const handleSelect = (value: string) => {
    field.handleChange(value === field.state.value ? '' : value)
    setSearch('')
  }

  const handleAdd = () => {
    const trimmed = search.trim()
    if (!trimmed) return

    const newOption = onAddItem
      ? onAddItem(trimmed)
      : { value: trimmed.toLowerCase(), label: trimmed }

    setOptions((prev) => [...prev, newOption])
    field.handleChange(newOption.value)
    setSearch('')
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
        <Command className="rounded-md border" shouldFilter={true}>
          <CommandInput
            id={field.name}
            placeholder={placeholder}
            value={search}
            onValueChange={setSearch}
            onBlur={field.handleBlur}
          />
          <CommandList>
            <CommandEmpty>
              {search.trim() ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
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
        {selectedOption && (
          <p className="text-sm text-muted-foreground">
            Selected: {selectedOption.label}
          </p>
        )}
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
