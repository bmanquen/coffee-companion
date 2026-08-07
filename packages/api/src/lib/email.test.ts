import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendInterestConfirmation } from './email'

const send = vi.hoisted(() => vi.fn())
vi.mock('resend', () => ({
  Resend: class {
    emails = { send }
  },
}))

describe('sendInterestConfirmation', () => {
  const original = { ...process.env }

  afterEach(() => {
    process.env = { ...original }
    send.mockClear()
  })

  const configured = () => {
    process.env.RESEND_API_KEY = 'test-key'
    process.env.RESEND_FROM = 'Coffee Companion <hello@example.com>'
  }

  it('sends nothing when no API key is configured', async () => {
    delete process.env.RESEND_API_KEY

    await sendInterestConfirmation({ to: 'someone@example.com', name: 'Ada' })

    expect(send).not.toHaveBeenCalled()
  })

  it('refuses to send from an unconfigured address', async () => {
    process.env.RESEND_API_KEY = 'test-key'
    delete process.env.RESEND_FROM

    await expect(
      sendInterestConfirmation({ to: 'someone@example.com', name: 'Ada' }),
    ).rejects.toThrow(/RESEND_FROM/)
    expect(send).not.toHaveBeenCalled()
  })

  it('leaves the wording to the template, passing only who was written to', async () => {
    configured()

    await sendInterestConfirmation({ to: 'someone@example.com', name: 'Ada' })

    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0]).toEqual({
      from: 'Coffee Companion <hello@example.com>',
      to: 'someone@example.com',
      template: {
        id: 'pro-plus-waitlist',
        variables: { NAME: 'Ada', USER_EMAIL: 'someone@example.com' },
      },
    })
  })

  // A variable left without a value fails the send outright, so someone who
  // signed in without a name still has to be greeted.
  it.each([undefined, null, '', '   '])(
    'greets a visitor with no usable name (%p)',
    async (name) => {
      configured()

      await sendInterestConfirmation({ to: 'someone@example.com', name })

      expect(send.mock.calls[0][0].template.variables.NAME).toBe('there')
    },
  )
})
