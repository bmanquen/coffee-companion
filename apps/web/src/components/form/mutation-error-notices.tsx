import { useStore } from '@tanstack/react-form'
import { useEffect } from 'react'
import { PlanLimitNotice } from '@/components/plan-limit-notice'
import {
  formLevelMessage,
  submittedValuesKey,
} from '@/lib/form-error'
import { planLimitMessage } from '@/lib/plan-limit'
import { FormBanner } from './form-banner'

type FormWithStore = {
  store: Parameters<typeof useStore<{ values: unknown }>>[0]
}

export function MutationErrorNotices({
  error,
  reset,
  form,
  fieldByCode,
}: {
  error: unknown
  reset: () => void
  form: FormWithStore
  fieldByCode?: Partial<Record<string, string>>
}) {
  const encoded = useStore(form.store, (s) => JSON.stringify(s.values))
  const submitted = submittedValuesKey(form)
  const live = error != null && submitted === encoded

  useEffect(() => {
    if (error != null && submitted !== undefined && encoded !== submitted) {
      reset()
    }
  }, [encoded, error, reset, submitted])

  const limitMessage = live ? planLimitMessage(error) : null
  const formMessage = live ? formLevelMessage(error, fieldByCode) : null
  return (
    <>
      {limitMessage ? <PlanLimitNotice message={limitMessage} /> : null}
      {formMessage ? <FormBanner message={formMessage} /> : null}
    </>
  )
}
