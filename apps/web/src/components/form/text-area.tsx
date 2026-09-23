import { Field, FieldContent, FieldDescription, FieldError } from '../ui/field'
import { Textarea } from '../ui/textarea'
import { FormLabel } from './form-label'
import { useFieldError } from './use-field-error'
import { useFieldRequired } from './use-field-required'
import { useFieldContext } from '@/hooks/form-context'

type Props = {
  label: string
  showLabel?: boolean
  description?: string
  placeholder?: string
}

export function TextArea({
  label,
  showLabel = true,
  description,
  placeholder,
}: Props) {
  const field = useFieldContext<string | null>()
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
        <Textarea
          id={field.name}
          name={field.name}
          placeholder={placeholder}
          value={field.state.value ?? ''}
          onBlur={field.handleBlur}
          onChange={(e) => field.handleChange(e.target.value)}
          rows={10}
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
