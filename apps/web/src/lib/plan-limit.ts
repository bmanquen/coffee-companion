// A Plan limit refuses with FORBIDDEN, which no other failure in the app uses —
// validation is BAD_REQUEST and a fault is INTERNAL_SERVER_ERROR. That is what
// lets a refusal be offered as an upgrade rather than reported as an error.
export function planLimitMessage(error: unknown): string | null {
  if (!(error instanceof Error)) return null

  const data = (error as { data?: { code?: unknown } }).data
  if (data?.code !== 'FORBIDDEN') return null

  return error.message
}
