import { useFieldContext } from '@/hooks/form-context'
import { Input } from '@/components/ui/input'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field'

export function TextField({
  label,
  description,
  placeholder,
  type = 'text',
}: {
  label: string
  description?: string
  placeholder?: string
  type?: React.ComponentProps<'input'>['type']
}) {
  const field = useFieldContext<string>()

  return (
    <Field>
      <FieldLabel htmlFor={field.name} className="sr-only">{label}</FieldLabel>
      <FieldContent>
        <Input
          id={field.name}
          name={field.name}
          type={type}
          placeholder={placeholder}
          value={field.state.value}
          onBlur={field.handleBlur}
          onChange={(e) => field.handleChange(e.target.value)}
          aria-invalid={field.state.meta.errors.length > 0}
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
