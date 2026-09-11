// Seam so the API never imports a logging library — the server instrument sets
// the sink, the same shape as the error-capture seam.

// One string for both packages, so a request line and its procedure lines
// correlate.
export const REQUEST_ID_HEADER = 'x-request-id'

export type LogLevel = 'info' | 'warn' | 'error'

export type LogSink = (
  level: LogLevel,
  message: string,
  fields: Record<string, unknown>,
) => void

let sink: LogSink | null = null

export function setLogSink(next: LogSink | null) {
  sink = next
}

export function log(
  level: LogLevel,
  message: string,
  fields: Record<string, unknown> = {},
) {
  sink?.(level, message, fields)
}

// The request a line belongs to, spread into fields so a line carries no
// requestId at all when nothing upstream set the header.
export function requestField(headers: Headers) {
  const requestId = headers.get(REQUEST_ID_HEADER)
  return requestId ? { requestId } : {}
}
