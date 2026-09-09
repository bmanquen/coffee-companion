// A successful reply from the tRPC batch stream link for a single procedure,
// so a test's fetch spy can let a mutation reach its onSuccess.
export function trpcSuccess(data: unknown = {}) {
  const head = { '0': [[{ result: { data } }]] }
  return new Response(JSON.stringify({ json: head }) + '\n', {
    status: 200,
    headers: { 'content-type': 'application/jsonl' },
  })
}
