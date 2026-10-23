export const EMAIL_ALREADY_ASSOCIATED =
  'This email is already associated with an account.'

export const UNVERIFIED_EMAIL_HOLDER_DOMAIN = 'unverified.invalid'

export type EmailHold = 'free' | 'verified' | 'released'

export function unverifiedEmailPlaceholder(userId: string): string {
  return `${userId}@${UNVERIFIED_EMAIL_HOLDER_DOMAIN}`
}

export function emailFromJwtPayload(token: string): string | null {
  const parts = token.split('.')
  const encoded = parts[1]
  if (parts.length < 2 || !encoded) return null
  try {
    const payload: unknown = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    )
    if (!payload || typeof payload !== 'object' || !('email' in payload)) {
      return null
    }
    if (typeof payload.email !== 'string') return null
    const email = payload.email.trim().toLowerCase()
    return email.includes('@') ? email : null
  } catch {
    return null
  }
}

export function emailFromSocialIdToken(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const idToken = 'idToken' in body ? body.idToken : null
  if (typeof idToken === 'string') return emailFromJwtPayload(idToken)
  if (!idToken || typeof idToken !== 'object' || !('token' in idToken)) {
    return null
  }
  return typeof idToken.token === 'string'
    ? emailFromJwtPayload(idToken.token)
    : null
}
