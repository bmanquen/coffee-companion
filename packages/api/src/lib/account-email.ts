export const EMAIL_ALREADY_ASSOCIATED_CODE = 'EMAIL_ALREADY_ASSOCIATED'

// Same wording as a generic sign-in failure so the response does not say
// whether the address already has an account.
export const EMAIL_ALREADY_ASSOCIATED = "We couldn't sign you in. Try again."

export const UNVERIFIED_EMAIL_HOLDER_DOMAIN = 'unverified.invalid'

export type EmailHold = 'free' | 'verified' | 'released'

export type SocialIdToken = {
  provider: string
  token: string
  nonce?: string
}

export type VerifiedSocialIdentity = {
  email: string
  emailVerified: boolean
}

export function encodeHeldEmail(email: string) {
  return Buffer.from(email, 'utf8').toString('base64url')
}

function escapeLikeWildcards(value: string) {
  return value.replace(/[\\%_]/g, '\\$&')
}

export function legacyUnverifiedEmailPlaceholder(heldEmail: string): string {
  return `${encodeHeldEmail(heldEmail)}@${UNVERIFIED_EMAIL_HOLDER_DOMAIN}`
}

export function unverifiedEmailPlaceholder(
  heldEmail: string,
  holderId: string,
): string {
  return `${encodeHeldEmail(heldEmail)}.${holderId}@${UNVERIFIED_EMAIL_HOLDER_DOMAIN}`
}

export function unverifiedEmailHoldPrefixPattern(heldEmail: string): string {
  return `${escapeLikeWildcards(encodeHeldEmail(heldEmail))}.%@${UNVERIFIED_EMAIL_HOLDER_DOMAIN}`
}

export function emailIsUnverifiedHolderAddress(email: string): boolean {
  return email.toLowerCase().endsWith(`@${UNVERIFIED_EMAIL_HOLDER_DOMAIN}`)
}

export function isEmailVerifiedClaim(value: unknown): boolean {
  return value === true || value === 'true'
}

export function socialIdTokenFromBody(body: unknown): SocialIdToken | null {
  if (!body || typeof body !== 'object') return null
  const provider =
    'provider' in body && typeof body.provider === 'string'
      ? body.provider
      : null
  if (!provider) return null

  const idToken = 'idToken' in body ? body.idToken : null
  if (typeof idToken === 'string') {
    return idToken ? { provider, token: idToken } : null
  }
  if (!idToken || typeof idToken !== 'object' || !('token' in idToken)) {
    return null
  }
  if (typeof idToken.token !== 'string' || !idToken.token) return null
  const nonce =
    'nonce' in idToken && typeof idToken.nonce === 'string'
      ? idToken.nonce
      : undefined
  return { provider, token: idToken.token, nonce }
}

export function identityFromVerifiedJwt(
  token: string,
): VerifiedSocialIdentity | null {
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
    if (!email.includes('@')) return null
    const emailVerified =
      'email_verified' in payload
        ? isEmailVerifiedClaim(payload.email_verified)
        : 'emailVerified' in payload
          ? isEmailVerifiedClaim(payload.emailVerified)
          : false
    return { email, emailVerified }
  } catch {
    return null
  }
}
