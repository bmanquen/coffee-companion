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

export function errorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null
  if ('code' in error && typeof error.code === 'string') return error.code
  return null
}
