import {
  calendarDateFromLocalDate,
  localDateFromCalendarDate,
} from '@coffee-companion/api/lib/calendar-date'
import { format } from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Field, FieldContent, FieldError } from '@/components/ui/field'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useFieldContext } from '@/hooks/form-context'
import { useFieldRequired } from './use-field-required'
import { useFieldError } from './use-field-error'
import { FormLabel } from './form-label'

type DatePickerProps = {
  label: string
  showLabel?: boolean
}

function monthToOpenOn(selected: Date | undefined): Date {
  return selected ?? new Date()
}

export function DatePicker({ label, showLabel = true }: DatePickerProps) {
  const field = useFieldContext<string | null>()
  const required = useFieldRequired()
  const error = useFieldError()
  const [open, setOpen] = useState(false)
  const selected = field.state.value
    ? localDateFromCalendarDate(field.state.value)
    : undefined
  const [visibleMonth, setVisibleMonth] = useState(() => monthToOpenOn(selected))

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
            if (next) setVisibleMonth(monthToOpenOn(selected))
            setOpen(next)
          }}
        >
          <PopoverTrigger asChild>
            <Button
              id={field.name}
              variant="outline"
              className={`flex justify-between ${!field.state.value ? 'text-muted-foreground/40' : ''}`}
              aria-invalid={error.invalid || undefined}
              aria-describedby={error.describedBy}
              aria-required={required || undefined}
            >
              {selected ? format(selected, 'PPP') : <span>Pick a date</span>}
              <CalendarIcon />
            </Button>
          </PopoverTrigger>
          <PopoverContent>
            <Calendar
              mode="single"
              required // re-clicking the selected day would otherwise unselect
              selected={selected}
              month={visibleMonth}
              onMonthChange={setVisibleMonth}
              onSelect={(date) => {
                field.handleChange(calendarDateFromLocalDate(date))
                setOpen(false)
              }}
            />
          </PopoverContent>
        </Popover>
        {/* The calendar cannot unselect a day, so an optional date that was
            filled in (by hand or by prefill) needs its own way back to blank. */}
        {!required && field.state.value ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start"
            aria-label={`Clear ${label}`}
            onClick={() => field.handleChange(null)}
          >
            Clear
          </Button>
        ) : null}
        {error.shown && (
          <FieldError id={error.errorId}>
            {error.messages.join(', ')}
          </FieldError>
        )}
      </FieldContent>
    </Field>
  )
}
