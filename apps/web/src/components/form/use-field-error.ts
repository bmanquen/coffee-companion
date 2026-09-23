import { useStore } from '@tanstack/react-form'
import { useFieldContext } from '@/hooks/form-context'

export function fieldErrorId(name: string) {
  return `${name.replace(/[^a-zA-Z0-9_-]/g, '-')}-error`
}

function errorMessage(error: unknown): string {
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message: unknown }).message
    if (typeof message === 'string') return message
  }
  return ''
}

export function useFieldError() {
  const field = useFieldContext()
  const attempts = useStore(field.form.store, (s) => s.submissionAttempts)
  const messages = field.state.meta.errors.map(errorMessage).filter(Boolean)
  const shown =
    messages.length > 0 && (field.state.meta.isTouched || attempts > 0)
  const errorId = fieldErrorId(String(field.name))
  return {
    shown,
    messages,
    invalid: shown,
    describedBy: shown ? errorId : undefined,
    errorId,
  }
}
