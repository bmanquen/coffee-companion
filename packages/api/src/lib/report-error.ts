// Seam so the API never imports Sentry — a static import puts the Node
// SDK on the SSR graph.

export interface ErrorReport {
  tags?: Record<string, string>
  // The id and nothing else, per ADR-0012.
  user?: { id: string }
}

export type ErrorCapture = (error: unknown, report: ErrorReport) => void

let capture: ErrorCapture | null = null

export function setErrorCapture(next: ErrorCapture | null) {
  capture = next
}

export function reportError(error: unknown, report: ErrorReport = {}) {
  capture?.(error, report)
}
