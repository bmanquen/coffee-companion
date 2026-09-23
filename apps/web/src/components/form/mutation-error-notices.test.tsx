import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { MutationErrorNotices } from './mutation-error-notices'
import { useAppForm } from '@/hooks/form'
import { rememberSubmittedValues } from '@/lib/form-error'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}))

const serverError = Object.assign(new Error('Coffee not found'), {
  data: { code: 'NOT_FOUND' },
})

function Harness() {
  const [error, setError] = useState<Error | null>(null)
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
      <button
        type="button"
        onClick={() => rememberSubmittedValues(form, { name: 'Ethiopia' })}
      >
        Submit
      </button>
      <button type="button" onClick={() => setError(serverError)}>
        Fail
      </button>
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
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Fail' }))
    expect(screen.getByRole('alert').textContent).toBe('Coffee not found')
  })

  it('clears the banner when the user edits after a failure', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Fail' }))
    expect(screen.getByRole('alert')).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Kenya Nyeri' },
    })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('does not show a banner for values edited while the request was pending', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Kenya Nyeri' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Fail' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
