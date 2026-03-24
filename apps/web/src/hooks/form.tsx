import { DatePicker } from '@/components/form/date-picker'
import { SearchSelect } from '@/components/form/search-select'
import { TextArea } from '@/components/form/text-area'
import { TextField } from '@/components/form/text-field'
import { createFormHook } from '@tanstack/react-form'
import { fieldContext, formContext } from './form-context'

export const { useAppForm, withForm, withFieldGroup } = createFormHook({
  fieldComponents: {
    TextField,
    SearchSelect,
    DatePicker,
    TextArea,
  },
  formComponents: {},
  fieldContext,
  formContext,
})
