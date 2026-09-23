import { FormBanner } from './form-banner'
import { PlanLimitNotice } from '@/components/plan-limit-notice'
import { formLevelMessage } from '@/lib/form-error'
import { planLimitMessage } from '@/lib/plan-limit'

export function MutationErrorNotices({
  error,
  fieldByCode,
}: {
  error: unknown
  fieldByCode?: Partial<Record<string, string>>
}) {
  const limitMessage = planLimitMessage(error)
  const formMessage = formLevelMessage(error, fieldByCode)
  return (
    <>
      {limitMessage ? <PlanLimitNotice message={limitMessage} /> : null}
      {formMessage ? <FormBanner message={formMessage} /> : null}
    </>
  )
}
