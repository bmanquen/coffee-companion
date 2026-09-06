import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { useFieldRequired } from './use-field-required'
import { useAppForm } from '@/hooks/form'

function RequiredFlag() {
  return <output>{String(useFieldRequired())}</output>
}

describe('useFieldRequired', () => {
  it('is true when the field-level schema rejects empty', () => {
    function Harness() {
      const form = useAppForm({ defaultValues: { name: '' } })
      return (
        <form.AppField name="name" validators={{ onChange: z.string().min(1) }}>
          {() => <RequiredFlag />}
        </form.AppField>
      )
    }

    render(<Harness />)
    expect(screen.getByRole('status').textContent).toBe('true')
  })

  it('is true when the form schema rejects empty for that field', () => {
    function Harness() {
      const form = useAppForm({
        defaultValues: { name: '', notes: '' },
        validators: {
          onChange: z.object({
            name: z.string().min(1),
            notes: z.string().nullish(),
          }),
        },
      })
      return <form.AppField name="name">{() => <RequiredFlag />}</form.AppField>
    }

    render(<Harness />)
    expect(screen.getByRole('status').textContent).toBe('true')
  })

  it('is false when the form schema accepts empty', () => {
    function Harness() {
      const form = useAppForm({
        defaultValues: { notes: null as string | null },
        validators: {
          onChange: z.object({ notes: z.string().nullish() }),
        },
      })
      return (
        <form.AppField name="notes">{() => <RequiredFlag />}</form.AppField>
      )
    }

    render(<Harness />)
    expect(screen.getByRole('status').textContent).toBe('false')
  })
})
