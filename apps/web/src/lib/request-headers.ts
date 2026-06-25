import { createIsomorphicFn } from '@tanstack/react-start'

// Forwards the incoming request's cookie during SSR so server-side session
// lookups (authClient.getSession) see the user's session. On the client it's a
// no-op, since the browser sends cookies automatically.
export const getForwardedHeaders = createIsomorphicFn()
  .client((): Record<string, string> => ({}))
  .server(async (): Promise<Record<string, string>> => {
    const { getRequestHeaders } = await import('@tanstack/react-start/server')
    const cookie = getRequestHeaders().get('cookie')
    return cookie ? { cookie } : {}
  })
