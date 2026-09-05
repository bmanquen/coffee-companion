// A place for swallowed errors to go so they can still be seen. The web app
// wires this to Sentry when a DSN is set; without that, reporting is a no-op
// and nothing fails — the same shape as outbound mail and billing.

export type ErrorTags = Record<string, string>

export type ErrorCapture = (error: unknown, tags: ErrorTags) => void

let capture: ErrorCapture | null = null

export function setErrorCapture(next: ErrorCapture | null) {
  capture = next
}

export function reportError(error: unknown, tags: ErrorTags = {}) {
  capture?.(error, tags)
}
