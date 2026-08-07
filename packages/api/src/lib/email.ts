import { Resend } from 'resend'

export async function sendInterestConfirmation({
  to,
  name,
}: {
  to: string
  name?: string | null
}) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return

  const from = process.env.RESEND_FROM
  if (!from) {
    throw new Error('RESEND_FROM must be set whenever RESEND_API_KEY is')
  }

  await new Resend(apiKey).emails.send({
    from,
    to,
    template: {
      id: 'pro-plus-waitlist',
      variables: { NAME: name?.trim() || 'there', USER_EMAIL: to },
    },
  })
}
