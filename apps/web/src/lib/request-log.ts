import {
  E2E_AUTH_HEADER,
  isE2EAuthRuntime,
} from '@coffee-companion/api/lib/e2e-auth'
import { REQUEST_ID_HEADER } from '@coffee-companion/api/lib/log'
import { HEALTH_PATH } from './health'

const SKIPPED_PATHS = new Set(['/favicon.ico', '/manifest.json', HEALTH_PATH])

export type RequestRecord = {
  method: string
  path: string
  status: number
  duration: number
  requestId: string
  expoOrigin?: string
  e2eAuth?: boolean
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
  const expoOrigin = sanitizedExpoOrigin(request.headers.get('expo-origin'))
  const e2eAuth =
    path.endsWith('/get-session') && isE2EAuthRuntime()
      ? Boolean(request.headers.get(E2E_AUTH_HEADER)?.trim())
      : undefined
  return {
    method: request.method,
    path,
    status,
    duration,
    requestId: id,
    ...(expoOrigin ? { expoOrigin } : {}),
    ...(e2eAuth !== undefined ? { e2eAuth } : {}),
  }
}

function sanitizedExpoOrigin(value: string | null): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  try {
    const url = new URL(trimmed)
    url.search = ''
    url.hash = ''
    url.username = ''
    url.password = ''
    return url.href
  } catch {
    return undefined
  }
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
