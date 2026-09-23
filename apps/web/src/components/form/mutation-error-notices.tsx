import { useStore } from '@tanstack/react-form'
import { useEffect, useRef } from 'react'
import { FormBanner } from './form-banner'
import { PlanLimitNotice } from '@/components/plan-limit-notice'
import { formLevelMessage } from '@/lib/form-error'
import { planLimitMessage } from '@/lib/plan-limit'

type FormWithStore = { store: Parameters<typeof useStore>[0] }

function useResetMutationOnEdit(
  form: FormWithStore,
  error: unknown,
  reset: () => void,
) {
  const encoded = useStore(form.store, (s: { values: unknown }) =>
    JSON.stringify(s.values),
  )
  const submitted = useRef<string | null>(null)

  useEffect(() => {
    if (error == null) {
      submitted.current = null
      return
    }
    if (submitted.current === null) {
      submitted.current = encoded
      return
    }
    if (encoded !== submitted.current) {
      submitted.current = null
      reset()
    }
  }, [encoded, error, reset])
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
  useResetMutationOnEdit(form, error, reset)
  const limitMessage = planLimitMessage(error)
  const formMessage = formLevelMessage(error, fieldByCode)
  return (
    <>
      {limitMessage ? <PlanLimitNotice message={limitMessage} /> : null}
      {formMessage ? <FormBanner message={formMessage} /> : null}
    </>
  )
}
