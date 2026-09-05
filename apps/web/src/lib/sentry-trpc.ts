// tRPC's HTTP adapter is where procedure crashes become responses. Expected
// refusals (unauthenticated, not found, a validation miss) stay out of
// Sentry; an INTERNAL_SERVER_ERROR is the one that means a user hit a bug
// on a Plan, Sealing, or billing path. Tags carry the procedure and Plan,
// never the session or the input.

export type TrpcErrorLike = {
  code: string
  cause?: unknown
}

export type CaptureException = (
  error: unknown,
  context: { tags: Record<string, string> },
) => void

export function sentryAreaForProcedure(path: string | undefined): string {
  if (!path) return 'trpc'
  if (path === 'plan.prices') return 'billing'
  if (path.startsWith('plan.') || path.startsWith('planInterest.'))
    return 'plan'
  if (
    /^(espressoShot|pouroverBrew|frenchpressBrew|aeropressBrew|coldBrewBrew|coffee)\./.test(
      path,
    )
  ) {
    return 'sealing'
  }
  return 'trpc'
}

function planFrom(ctx: unknown): string | undefined {
  if (
    ctx &&
    typeof ctx === 'object' &&
    'plan' in ctx &&
    typeof ctx.plan === 'string'
  ) {
    return ctx.plan
  }
}

export function reportTrpcError(
  error: TrpcErrorLike,
  path: string | undefined,
  ctx: unknown,
  capture: CaptureException,
) {
  if (error.code !== 'INTERNAL_SERVER_ERROR') return

  const tags: Record<string, string> = {
    area: sentryAreaForProcedure(path),
    procedure: path ?? 'unknown',
  }
  const plan = planFrom(ctx)
  if (plan) tags.plan = plan

  capture(error.cause ?? error, { tags })
}
