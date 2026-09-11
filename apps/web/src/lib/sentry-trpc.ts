import type { ErrorCapture } from '@coffee-companion/api/lib/report-error'
import type { TRPCContext } from '@coffee-companion/api/trpc/init'

export type TrpcErrorLike = {
  code: string
  cause?: unknown
}

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

export function reportTrpcError(
  error: TrpcErrorLike,
  path: string | undefined,
  ctx: Pick<TRPCContext, 'callers'> | undefined,
  capture: ErrorCapture,
) {
  // Only INTERNAL_SERVER_ERROR — expected refusals are not bugs.
  if (error.code !== 'INTERNAL_SERVER_ERROR') return

  // By path, not the whole request: one context serves a batch, so a public
  // procedure failing alongside an authed one still belongs to nobody.
  const caller = path ? ctx?.callers?.get(path) : undefined
  const tags: Record<string, string> = {
    area: sentryAreaForProcedure(path),
    procedure: path ?? 'unknown',
  }
  if (caller?.plan) tags.plan = caller.plan

  capture(
    error.cause ?? error,
    caller ? { tags, user: { id: caller.id } } : { tags },
  )
}
