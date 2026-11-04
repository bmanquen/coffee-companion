export const APPLE_ERR_REQUEST_CANCELED = 'ERR_REQUEST_CANCELED'
export const GOOGLE_SIGN_IN_CANCELLED = 'SIGN_IN_CANCELLED'
export const GOOGLE_IN_PROGRESS = 'IN_PROGRESS'
export const GOOGLE_PLAY_SERVICES_NOT_AVAILABLE = 'PLAY_SERVICES_NOT_AVAILABLE'

export class SignInCancelled extends Error {
  constructor() {
    super('cancelled')
    this.name = 'SignInCancelled'
  }
}

export class SignInFailed extends Error {
  constructor() {
    super('failed')
    this.name = 'SignInFailed'
  }
}

export class SignInUnavailable extends Error {
  constructor() {
    super('unavailable')
    this.name = 'SignInUnavailable'
  }
}

export class PlayServicesMissing extends Error {
  constructor() {
    super('play-services')
    this.name = 'PlayServicesMissing'
  }
}

export const EMAIL_ALREADY_ASSOCIATED_CODE = 'EMAIL_ALREADY_ASSOCIATED'
export const OAUTH_LINK_ERROR_CODE = 'OAUTH_LINK_ERROR'

export const SIGN_IN_CONFLICT_CODES = [
  EMAIL_ALREADY_ASSOCIATED_CODE,
  OAUTH_LINK_ERROR_CODE,
] as const

export class SignInConflict extends Error {
  constructor() {
    super('sign-in-conflict')
    this.name = 'SignInConflict'
  }
}

export function isSignInConflictCode(
  code: string | null,
): code is (typeof SIGN_IN_CONFLICT_CODES)[number] {
  return (
    code !== null &&
    (SIGN_IN_CONFLICT_CODES as ReadonlyArray<string>).includes(code)
  )
}

export function errorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null
  if ('code' in error && typeof error.code === 'string') return error.code
  return null
}

export function failureMessage(caught: unknown): string {
  if (caught instanceof Error) return caught.message || caught.name
  if (typeof caught === 'string') return caught
  if (
    caught &&
    typeof caught === 'object' &&
    'message' in caught &&
    typeof caught.message === 'string' &&
    caught.message
  ) {
    return caught.message
  }
  try {
    return JSON.stringify(caught)
  } catch {
    return String(caught)
  }
}
