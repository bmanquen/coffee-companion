// The path Railway polls. Shared so the request logger and Sentry can keep the
// poll out of the logs and the traces without restating it.
export const HEALTH_PATH = '/api/health'

// Public, so the body says whether the app and its database answer and nothing
// else — no version, no configuration, no error text.
export function healthResponse(db: 'ok' | 'unreachable'): Response {
  const ok = db === 'ok'

  return Response.json(
    { status: ok ? 'ok' : 'degraded', db },
    {
      status: ok ? 200 : 503,
      headers: { 'cache-control': 'no-store' },
    },
  )
}
