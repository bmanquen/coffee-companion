import { format } from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import { FormLabel } from './form-label'
import { useFieldError } from './use-field-error'
import { useFieldRequired } from './use-field-required'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Field, FieldContent, FieldError } from '@/components/ui/field'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useFieldContext } from '@/hooks/form-context'

type DatePickerProps = {
  label: string
  showLabel?: boolean
}

export function DatePicker({ label, showLabel = true }: DatePickerProps) {
  const field = useFieldContext<Date | undefined>()
  const required = useFieldRequired()
  const error = useFieldError()

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
        <Popover>
          <PopoverTrigger asChild>
            <Button
              id={field.name}
              variant="outline"
              className={`flex justify-between ${!field.state.value ? 'text-muted-foreground/40' : ''}`}
              aria-invalid={error.invalid || undefined}
              aria-describedby={error.describedBy}
              aria-required={required || undefined}
            >
              {field.state.value ? (
                format(field.state.value, 'PPP')
              ) : (
                <span>Pick a date</span>
              )}
              <CalendarIcon />
            </Button>
          </PopoverTrigger>
          <PopoverContent>
            <Calendar
              mode="single"
              selected={field.state.value}
              onSelect={(date) => {
                if (date) field.handleChange(date)
              }}
            />
          </PopoverContent>
        </Popover>
        {error.shown && (
          <FieldError id={error.errorId}>{error.messages.join(', ')}</FieldError>
        )}
      </FieldContent>
    </Field>
  )
}
