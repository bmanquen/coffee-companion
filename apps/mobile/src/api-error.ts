type TrpcShapedError = Error & { data?: { code?: unknown } }

// espressoShot throws these with user-facing copy (sealed, missing device/shot).
// BAD_REQUEST also carries raw Zod JSON, so it and other codes use the fallback.
const USER_FACING_TRPC_CODES = new Set(['FORBIDDEN', 'NOT_FOUND'])

export function apiErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error) || !error.message) return fallback
  const code = (error as TrpcShapedError).data?.code
  if (typeof code !== 'string' || !USER_FACING_TRPC_CODES.has(code)) {
    return fallback
  }
  return error.message
}
