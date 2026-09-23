import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { MutationErrorNotices } from './mutation-error-notices'
import { useAppForm } from '@/hooks/form'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}))

const serverError = Object.assign(new Error('Coffee not found'), {
  data: { code: 'NOT_FOUND' },
})

function Harness({ startWithError = true }: { startWithError?: boolean }) {
  const [error, setError] = useState<Error | null>(
    startWithError ? serverError : null,
  )
  const form = useAppForm({ defaultValues: { name: 'Ethiopia' } })
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
      }}
    >
      <form.AppField name="name">
        {(field) => <field.TextField label="Name" />}
      </form.AppField>
      <MutationErrorNotices
        error={error}
        reset={() => setError(null)}
        form={form}
      />
    </form>
  )
}

describe('MutationErrorNotices', () => {
  it('shows a form banner for an unmapped server error', () => {
    render(<Harness />)
    expect(screen.getByRole('alert').textContent).toBe('Coffee not found')
  })

  it('clears the banner when the user edits after a failure', () => {
    render(<Harness />)
    expect(screen.getByRole('alert')).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Kenya Nyeri' },
    })
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
