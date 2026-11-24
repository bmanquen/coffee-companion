import superjson from 'superjson'

// A batch stream link reply carrying this head, encoded as the server's
// SuperJSON transformer sends it, so Dates and other types come through as
// they do in the app.
export function trpcStreamResponse(head: unknown) {
  return new Response(JSON.stringify(superjson.serialize(head)) + '\n', {
    status: 200,
    headers: { 'content-type': 'application/jsonl' },
  })
}

// A successful reply from the tRPC batch stream link for a single procedure,
// so a test's fetch spy can let a mutation reach its onSuccess.
export function trpcSuccess(data: unknown = {}) {
  const head = { '0': [[{ result: { data } }]] }
  return trpcStreamResponse(head)
}

// An error reply from the tRPC batch stream link for a single procedure, in
// the shape the server's error formatter sends, so the client sees a
// TRPCClientError with this code and message.
export function trpcErrorResponse(
  code: 'CONFLICT' | 'BAD_REQUEST' | 'NOT_FOUND',
  message: string,
) {
  const rpcCodes = { BAD_REQUEST: -32600, NOT_FOUND: -32004, CONFLICT: -32009 }
  const httpStatuses = { BAD_REQUEST: 400, NOT_FOUND: 404, CONFLICT: 409 }
  const error = {
    message,
    code: rpcCodes[code],
    data: { code, httpStatus: httpStatuses[code] },
  }
  const head = { '0': [[{ error }]] }
  return trpcStreamResponse(head)
}

// A reply to a request the batch stream link may have batched: one result
// per procedure in the URL, in its slot, from dataFor(procedure name).
export function trpcBatchSuccess(
  input: RequestInfo | URL,
  dataFor: (procedure: string) => unknown,
) {
  const url = new URL(
    input instanceof Request ? input.url : String(input),
    'http://localhost',
  )
  const procedures = decodeURIComponent(
    url.pathname.split('/').pop() ?? '',
  ).split(',')
  const head = Object.fromEntries(
    procedures.map((procedure, index) => [
      String(index),
      [[{ result: { data: dataFor(procedure) } }]],
    ]),
  )
  return trpcStreamResponse(head)
}
