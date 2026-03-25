import { useFieldContext } from '@/hooks/form-context'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '../ui/field'
import { Textarea } from '../ui/textarea'

type Props = {
  label: string
  description?: string
  placeholder?: string
}

export function TextArea({ label, description, placeholder }: Props) {
  const field = useFieldContext<string>()

  return (
    <Field>
      <FieldLabel htmlFor={field.name} className="sr-only">
        {label}
      </FieldLabel>
      <FieldContent>
        <Textarea
          id={field.name}
          name={field.name}
          placeholder={placeholder}
          value={field.state.value ?? ''}
          onBlur={field.handleBlur}
          onChange={(e) => field.handleChange(e.target.value)}
          rows={10}
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
