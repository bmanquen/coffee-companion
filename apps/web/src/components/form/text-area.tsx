import { Field, FieldContent, FieldDescription, FieldError } from '../ui/field'
import { Textarea } from '../ui/textarea'
import { FormLabel } from './form-label'
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

  return (
    <Field>
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
          aria-required={required || undefined}
        />
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
