// A successful reply from the tRPC batch stream link for a single procedure,
// so a test's fetch spy can let a mutation reach its onSuccess.
export function trpcSuccess(data: unknown = {}) {
  const head = { '0': [[{ result: { data } }]] }
  return new Response(JSON.stringify({ json: head }) + '\n', {
    status: 200,
    headers: { 'content-type': 'application/jsonl' },
  })
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
  return new Response(JSON.stringify({ json: head }) + '\n', {
    status: 200,
    headers: { 'content-type': 'application/jsonl' },
  })
}
