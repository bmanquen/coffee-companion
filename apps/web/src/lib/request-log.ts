export const REQUEST_ID_HEADER = 'x-request-id'

const SKIPPED_PATHS = new Set(['/favicon.ico', '/manifest.json', '/api/health'])

export type RequestRecord = {
  method: string
  path: string
  status: number
  duration: number
  requestId: string
}

export function requestId(request: Request): string {
  const incoming = request.headers.get(REQUEST_ID_HEADER)?.trim()
  return incoming ? incoming : crypto.randomUUID()
}

export function requestRecord(
  request: Request,
  status: number,
  duration: number,
  id: string,
): RequestRecord | null {
  const path = new URL(request.url).pathname
  if (path.startsWith('/assets/') || SKIPPED_PATHS.has(path)) return null
  return { method: request.method, path, status, duration, requestId: id }
}

function withRequestIdHeader(response: Response, id: string): Response {
  try {
    response.headers.set(REQUEST_ID_HEADER, id)
    return response
  } catch {
    const copy = new Response(response.body, response)
    copy.headers.set(REQUEST_ID_HEADER, id)
    return copy
  }
}

export function withRequestLog<
  TEntry extends {
    fetch: (
      request: Request,
      ...rest: Array<unknown>
    ) => Response | Promise<Response>
  },
>(
  entry: TEntry,
  hooks: { log: (record: RequestRecord) => void; tag: (id: string) => void },
): TEntry {
  return {
    ...entry,
    async fetch(request: Request, ...rest: Array<unknown>) {
      const id = requestId(request)
      request.headers.set(REQUEST_ID_HEADER, id)
      hooks.tag(id)
      const started = performance.now()
      let status = 500
      try {
        const response = await entry.fetch(request, ...rest)
        status = response.status
        return withRequestIdHeader(response, id)
      } finally {
        const record = requestRecord(
          request,
          status,
          Math.round(performance.now() - started),
          id,
        )
        if (record) hooks.log(record)
      }
    },
  }
}
