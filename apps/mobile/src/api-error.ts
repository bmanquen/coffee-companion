type TrpcShapedError = Error & { data?: { code?: unknown } }

export function apiErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error) || !error.message) return fallback
  const code = (error as TrpcShapedError).data?.code
  if (typeof code !== 'string') return fallback
  return error.message
}
