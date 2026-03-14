import { createFormHook } from '@tanstack/react-form'
import { fieldContext, formContext } from './form-context'
import { TextField } from '@/components/form/text-field'
import { SearchSelect } from '@/components/form/search-select'

export const { useAppForm, withForm, withFieldGroup } = createFormHook({
  fieldComponents: {
    TextField,
    SearchSelect,
  },
  formComponents: {},
  fieldContext,
  formContext,
})
