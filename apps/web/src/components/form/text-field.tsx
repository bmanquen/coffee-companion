import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
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

  return (
    <Field>
      <FieldLabel
        htmlFor={field.name}
        className={showLabel ? undefined : 'sr-only'}
      >
        {label}
      </FieldLabel>
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
