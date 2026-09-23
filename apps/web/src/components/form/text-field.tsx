import { FormLabel } from './form-label'
import { useFieldError } from './use-field-error'
import { useFieldRequired } from './use-field-required'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useFieldContext } from '@/hooks/form-context'

export function TextField({
  label,
  showLabel = true,
  description,
  placeholder,
  type = 'text',
  inputMode,
  step,
}: {
  label: string
  showLabel?: boolean
  description?: string
  placeholder?: string
  type?: React.ComponentProps<'input'>['type']
  inputMode?: React.ComponentProps<'input'>['inputMode']
  step?: React.ComponentProps<'input'>['step']
}) {
  const field = useFieldContext<string>()
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
        <Input
          id={field.name}
          name={field.name}
          type={type}
          inputMode={inputMode}
          step={step}
          placeholder={placeholder}
          value={field.state.value}
          onBlur={field.handleBlur}
          onChange={(e) => field.handleChange(e.target.value)}
          aria-invalid={error.invalid || undefined}
          aria-describedby={error.describedBy}
          aria-required={required || undefined}
        />
        {description && <FieldDescription>{description}</FieldDescription>}
        {error.shown && (
          <FieldError id={error.errorId}>{error.messages.join(', ')}</FieldError>
        )}
      </FieldContent>
    </Field>
  )
}
