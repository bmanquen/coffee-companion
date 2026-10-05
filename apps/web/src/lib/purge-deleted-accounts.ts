import { timingSafeEqual } from 'node:crypto'

const HTTP_OK = 200
const HTTP_UNAUTHORIZED = 401
const HTTP_NOT_FOUND = 404
const HTTP_METHOD_NOT_ALLOWED = 405

type Purge = () => Promise<{ purged: number }>

function trim(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed || undefined
}

function bearerToken(request: Request): string | undefined {
  const header = request.headers.get('authorization')
  const match = header?.match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : undefined
}

function secretsEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function purgeDeletedAccountsResponse(
  request: Request,
  secret = process.env.PURGE_SECRET,
  purge?: Purge,
): Promise<Response> {
  const expected = trim(secret)
  if (!expected) {
    return new Response(null, { status: HTTP_NOT_FOUND })
  }

  if (request.method !== 'POST') {
    return new Response(null, { status: HTTP_METHOD_NOT_ALLOWED })
  }

  const provided = bearerToken(request)
  if (!provided || !secretsEqual(provided, expected)) {
    return new Response(null, { status: HTTP_UNAUTHORIZED })
  }

  const run =
    purge ??
    (await import('@coffee-companion/api/lib/delete-account'))
      .purgeExpiredDeletedAccounts
  const result = await run()
  return Response.json(result, {
    status: HTTP_OK,
    headers: { 'cache-control': 'no-store' },
  })
}
