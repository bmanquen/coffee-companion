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
  // Only INTERNAL_SERVER_ERROR — expected refusals are not bugs.
  if (error.code !== 'INTERNAL_SERVER_ERROR') return

  const tags: Record<string, string> = {
    area: sentryAreaForProcedure(path),
    procedure: path ?? 'unknown',
  }
  const plan = planFrom(ctx)
  if (plan) tags.plan = plan

  capture(error.cause ?? error, { tags })
}
