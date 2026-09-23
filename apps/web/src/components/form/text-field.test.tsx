import {
  insertCoffeeSchema,
  insertGrinderSchema,
} from '@coffee-companion/api/db/zod'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { InsertCoffee } from '@coffee-companion/api/db/zod'
import { useAppForm } from '@/hooks/form'

function Harness() {
  const form = useAppForm({ defaultValues: { name: '' } })
  return (
    <form.AppField name="name">
      {(field) => (
        <field.TextField label="Coffee name" placeholder="Enter name" />
      )}
    </form.AppField>
  )
}

function ValidatedHarness() {
  const form = useAppForm({ defaultValues: { name: 'x' } })
  return (
    <form.AppField
      name="name"
      validators={{ onChange: z.string().min(1, 'Name is required') }}
    >
      {(field) => (
        <field.TextField label="Coffee name" placeholder="Enter name" />
      )}
    </form.AppField>
  )
}

function DescribedHarness({ showLabel }: { showLabel?: boolean }) {
  const form = useAppForm({ defaultValues: { name: '' } })
  return (
    <form.AppField name="name">
      {(field) => (
        <field.TextField
          label="Coffee name"
          showLabel={showLabel}
          description="As printed on the bag"
          placeholder="Enter name"
        />
      )}
    </form.AppField>
  )
}

describe('TextField', () => {
  it('renders the label and input', () => {
    render(<Harness />)
    expect(screen.getByLabelText('Coffee name')).toBeTruthy()
    expect(screen.getByPlaceholderText('Enter name')).toBeTruthy()
    expect(screen.getByPlaceholderText('Enter name').className).toContain(
      'placeholder:text-muted-foreground/40',
    )
  })

  it('updates the field value on change', async () => {
    render(<Harness />)
    const input = screen.getByPlaceholderText<HTMLInputElement>('Enter name')
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Ethiopia' } })
    })
    expect(input.value).toBe('Ethiopia')
  })

  it('shows a validation error once touched and invalid', async () => {
    render(<ValidatedHarness />)
    const input = screen.getByPlaceholderText('Enter name')
    await act(async () => {
      fireEvent.change(input, { target: { value: '' } })
      fireEvent.blur(input)
    })
    expect(screen.getByText('Name is required')).toBeTruthy()
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.getAttribute('aria-describedby')).toBe('name-error')
  })

  it('shows a validation error on submit without the field being touched', async () => {
    function SubmitHarness() {
      const form = useAppForm({
        defaultValues: { name: '' },
        validators: {
          onChange: z.object({ name: z.string().min(1, 'Name is required') }),
        },
      })
      return (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            form.handleSubmit()
          }}
        >
          <form.AppField name="name">
            {(field) => <field.TextField label="Name" />}
          </form.AppField>
          <button type="submit">Add</button>
        </form>
      )
    }

    render(<SubmitHarness />)
    expect(screen.queryByText('Name is required')).toBeNull()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    })
    const input = screen.getByRole('textbox', { name: 'Name' })
    expect(screen.getByText('Name is required')).toBeTruthy()
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.getAttribute('aria-describedby')).toBe('name-error')
    expect(document.getElementById('name-error')?.textContent).toBe(
      'Name is required',
    )
  })

  it('shows an onServer field error after submit', async () => {
    let setErrorMap: ((errorMap: never) => void) | undefined
    function ServerHarness() {
      const form = useAppForm({
        defaultValues: { name: 'Ethiopia' },
        validators: {
          onChange: z.object({ name: z.string().min(1) }),
        },
      })
      setErrorMap = form.setErrorMap
      return (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            form.handleSubmit()
          }}
        >
          <form.AppField name="name">
            {(field) => <field.TextField label="Name" />}
          </form.AppField>
          <button type="submit">Add</button>
        </form>
      )
    }

    render(<ServerHarness />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    })
    await act(async () => {
      setErrorMap?.({
        onServer: {
          fields: {
            name: 'A coffee with this name already exists for this roaster',
          },
        },
      } as never)
    })
    const input = screen.getByRole('textbox', { name: 'Name' })
    expect(
      screen.getByText(
        'A coffee with this name already exists for this roaster',
      ),
    ).toBeTruthy()
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.getAttribute('aria-describedby')).toBe('name-error')
  })

  it('renders a description when one is given', () => {
    render(<DescribedHarness />)

    expect(screen.getByText('As printed on the bag')).toBeTruthy()
  })

  // showLabel={false} hides the label visually but must keep it for screen
  // readers — dropping it would leave the input unlabelled.
  it('keeps the label reachable when it is visually hidden', () => {
    render(<DescribedHarness showLabel={false} />)

    const label = screen.getByText('Coffee name')
    expect(label.closest('[data-slot="field-label"]')?.className).toContain(
      'sr-only',
    )
    expect(screen.getByLabelText('Coffee name')).toBeTruthy()
  })

  it('marks the control required when the form schema blocks an empty value', () => {
    function SchemaHarness() {
      const form = useAppForm({
        defaultValues: { name: '', brand: '' },
        validators: { onChange: insertGrinderSchema },
      })
      return (
        <form.AppField name="name">
          {(field) => <field.TextField label="Name" />}
        </form.AppField>
      )
    }

    render(<SchemaHarness />)
    // The visible star is aria-hidden, so the accessible name stays "Name".
    const input = screen.getByRole('textbox', { name: 'Name' })
    expect(input.getAttribute('aria-required')).toBe('true')
    expect(screen.getByText('*').getAttribute('aria-hidden')).toBe('true')
  })

  it('leaves optional fields unmarked even when the form has a schema', () => {
    function OptionalHarness() {
      const defaultCoffee = {
        name: 'Ethiopia',
        roasterId: '',
        roastLevelId: '',
        notes: null,
        isActive: false,
      } as InsertCoffee
      const form = useAppForm({
        defaultValues: defaultCoffee,
        validators: { onChange: insertCoffeeSchema },
      })
      return (
        <form.AppField name="notes">
          {(field) => <field.TextField label="Notes" />}
        </form.AppField>
      )
    }

    render(<OptionalHarness />)
    const input = screen.getByLabelText('Notes')
    expect(input.getAttribute('aria-required')).toBeNull()
    expect(screen.queryByText('*')).toBeNull()
  })
})
