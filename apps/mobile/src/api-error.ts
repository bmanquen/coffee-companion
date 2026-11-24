type TrpcShapedError = Error & { data?: { code?: unknown } }

export const TRPC_FORBIDDEN = 'FORBIDDEN'
export const TRPC_NOT_FOUND = 'NOT_FOUND'
export const TRPC_CONFLICT = 'CONFLICT'

// espressoShot throws these with user-facing copy (sealed, missing device/shot,
// mismatched idempotent replay). BAD_REQUEST also carries raw Zod JSON, so it
// and other codes use the fallback.
const USER_FACING_TRPC_CODES = new Set([
  TRPC_FORBIDDEN,
  TRPC_NOT_FOUND,
  TRPC_CONFLICT,
])

export function apiErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error) || !error.message) return fallback
  const code = (error as TrpcShapedError).data?.code
  if (typeof code !== 'string' || !USER_FACING_TRPC_CODES.has(code)) {
    return fallback
  }
  return error.message
}

// The API answers a refusal with a tRPC code before it saves anything; a lost
// response, or a server error, may have come after the save committed.
export function mayHaveCommitted(error: unknown): boolean {
  const code = (error as TrpcShapedError | null)?.data?.code
  return typeof code !== 'string' || code === 'INTERNAL_SERVER_ERROR'
}
