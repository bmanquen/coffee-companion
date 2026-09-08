// Seam so the API never imports Sentry — a static import puts the Node
// SDK on the SSR graph.

export type ErrorTags = Record<string, string>

export type ErrorCapture = (error: unknown, tags: ErrorTags) => void

let capture: ErrorCapture | null = null

export function setErrorCapture(next: ErrorCapture | null) {
  capture = next
}

export function reportError(error: unknown, tags: ErrorTags = {}) {
  capture?.(error, tags)
}
