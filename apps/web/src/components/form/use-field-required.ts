import { isRequiredField, isRequiredSchema } from './is-required-field'
import { useFieldContext } from '@/hooks/form-context'

// Reads the field-level validator first, then the form-level onChange/onSubmit
// schema, so the star matches whatever actually blocks submit.
export function useFieldRequired(): boolean {
  const field = useFieldContext()
  const fieldValidator =
    field.options.validators?.onChange ?? field.options.validators?.onSubmit
  if (isRequiredSchema(fieldValidator)) return true

  const formValidator =
    field.form.options.validators?.onChange ??
    field.form.options.validators?.onSubmit
  return isRequiredField(formValidator, String(field.name))
}
