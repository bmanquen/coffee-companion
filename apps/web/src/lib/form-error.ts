import { planLimitMessage } from './plan-limit'

export type MappedFormError =
  | { kind: 'field'; name: string; message: string }
  | { kind: 'form'; message: string }
  | { kind: 'plan-limit'; message: string }

function trpcErrorCode(error: unknown): string | null {
  if (!(error instanceof Error)) return null
  const data = (error as { data?: { code?: unknown } }).data
  return typeof data?.code === 'string' ? data.code : null
}

function trpcErrorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'Something went wrong. Try again.'
}

export function mapMutationError(
  error: unknown,
  fieldByCode: Partial<Record<string, string>> = {},
): MappedFormError | null {
  if (error == null) return null
  const limit = planLimitMessage(error)
  if (limit) return { kind: 'plan-limit', message: limit }

  const message = trpcErrorMessage(error)
  const code = trpcErrorCode(error)
  const field = code ? fieldByCode[code] : undefined
  if (field) return { kind: 'field', name: field, message }
  return { kind: 'form', message }
}

export function formLevelMessage(
  error: unknown,
  fieldByCode: Partial<Record<string, string>> = {},
): string | null {
  const mapped = mapMutationError(error, fieldByCode)
  return mapped?.kind === 'form' ? mapped.message : null
}

type FormLike = {
  setErrorMap: (errorMap: never) => void
}

export function applyMutationError(
  form: FormLike,
  error: unknown,
  fieldByCode: Partial<Record<string, string>> = {},
): MappedFormError | null {
  const mapped = mapMutationError(error, fieldByCode)
  if (mapped?.kind === 'field') {
    form.setErrorMap({
      onServer: { fields: { [mapped.name]: mapped.message } },
    } as never)
  }
  return mapped
}

export async function submitFormMutation<T>(
  form: FormLike,
  mutate: (value: T) => Promise<unknown>,
  value: T,
  fieldByCode: Partial<Record<string, string>> = {},
) {
  try {
    await mutate(value)
  } catch (error) {
    applyMutationError(form, error, fieldByCode)
  }
}
