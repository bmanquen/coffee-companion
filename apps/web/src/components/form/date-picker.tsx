import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Field, FieldContent, FieldLabel } from '@/components/ui/field'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useFieldContext } from '@/hooks/form-context'
import { format } from 'date-fns'
import { CalendarIcon } from 'lucide-react'

type DatePickerProps = {
  label: string
  showLabel?: boolean
}

export function DatePicker({ label, showLabel = true }: DatePickerProps) {
  const field = useFieldContext<Date>()

  return (
    <Field>
      <FieldLabel
        htmlFor={field.name}
        className={showLabel ? undefined : 'sr-only'}
      >
        {label}
      </FieldLabel>
      <FieldContent>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={`flex justify-between ${!field.state.value ? 'text-muted-foreground' : ''}`}
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
      </FieldContent>
    </Field>
  )
}
