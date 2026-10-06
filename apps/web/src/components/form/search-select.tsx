import { CheckIcon, ChevronDownIcon, PlusIcon } from 'lucide-react'
import { useState } from 'react'
import { FormLabel } from './form-label'
import { useFieldError } from './use-field-error'
import { useFieldRequired } from './use-field-required'
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
} from '@/components/ui/field'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useFieldContext } from '@/hooks/form-context'
import { mapMutationError, trpcErrorCode } from '@/lib/form-error'
import { cn } from '@/lib/utils'

const ADD_FAILED = 'Something went wrong. Try again.'

function addErrorMessage(error: unknown) {
  if (trpcErrorCode(error) !== 'CONFLICT') return ADD_FAILED
  return mapMutationError(error)?.message ?? ADD_FAILED
}

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
  onValueChange,
  disabled = false,
  triggerClassName,
}: {
  label: string
  showLabel?: boolean
  description?: string
  placeholder?: string
  options: Array<SearchSelectOption>
  onAddItem?: (
    value: string,
  ) => SearchSelectOption | null | Promise<SearchSelectOption | null>
  onValueChange?: (value: string) => void
  disabled?: boolean
  triggerClassName?: string
}) {
  const field = useFieldContext<string>()
  const required = useFieldRequired()
  const error = useFieldError()
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const options = initialOptions

  const selectedOption = options.find((o) => o.value === field.state.value)

  const handleSearchChange = (value: string) => {
    setAddError(null)
    setSearch(value)
  }

  const handleSelect = (value: string) => {
    const next = value === field.state.value ? '' : value
    field.handleChange(next)
    onValueChange?.(next)
    setAddError(null)
    setSearch('')
    setOpen(false)
  }

  const handleAdd = async () => {
    const trimmed = search.trim()
    if (!trimmed) return

    let newOption: SearchSelectOption | null
    try {
      newOption = onAddItem
        ? await onAddItem(trimmed)
        : { value: trimmed.toLowerCase(), label: trimmed }
    } catch (failure) {
      setAddError(addErrorMessage(failure))
      return
    }

    if (!newOption) return

    field.handleChange(newOption.value)
    onValueChange?.(newOption.value)
    setAddError(null)
    setSearch('')
    setOpen(false)
  }

  const exactMatch = options.some(
    (o) => o.label.toLowerCase() === search.trim().toLowerCase(),
  )

  return (
    <Field data-invalid={error.shown || undefined}>
      <FormLabel
        htmlFor={field.name}
        required={required}
        className={showLabel ? undefined : 'sr-only'}
      >
        {label}
      </FormLabel>
      <FieldContent>
        <Popover
          open={open}
          onOpenChange={(next) => {
            setOpen(next)
            if (!next) {
              setAddError(null)
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
                selectedOption ? 'text-foreground' : 'text-muted-foreground/40',
                triggerClassName,
              )}
              disabled={disabled}
              aria-invalid={error.invalid || undefined}
              aria-describedby={error.describedBy}
              aria-required={required || undefined}
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
                onValueChange={handleSearchChange}
              />
              {addError && (
                <p role="alert" className="px-3 py-2 text-sm text-destructive">
                  {addError}
                </p>
              )}
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
        {error.shown && (
          <FieldError id={error.errorId}>{error.messages.join(', ')}</FieldError>
        )}
      </FieldContent>
    </Field>
  )
}
