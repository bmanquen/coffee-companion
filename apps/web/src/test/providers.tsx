import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createTRPCClient, httpBatchStreamLink } from '@trpc/client'
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query'
import superjson from 'superjson'
import { Suspense } from 'react'
import type { ReactNode } from 'react'
import type { TRPCRouter } from '@coffee-companion/api/trpc/router'
import { TRPCProvider } from '@/integrations/trpc/react'

type FetchFn = typeof fetch

// Builds an isolated QueryClient + matching tRPC proxy and a Wrapper that
// provides both (with a Suspense boundary for useSuspenseQuery). Seed the cache
// via `queryClient.setQueryData(trpc.x.y.queryKey(input), data)`.
//
// Fetch is looked up at request time so a later spyOn(globalThis, 'fetch')
// still intercepts the real tRPC transport. Pass `fetch` to inject a mock
// without racing a shared module-level client.
export function createTestProviders(options?: { fetch?: FetchFn }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const trpcClient = createTRPCClient<TRPCRouter>({
    links: [
      httpBatchStreamLink({
        transformer: superjson,
        url: 'http://localhost/api/trpc',
        fetch: (input, init) =>
          (options?.fetch ?? globalThis.fetch)(input, init),
      }),
    ],
  })
  const trpc = createTRPCOptionsProxy<TRPCRouter>({
    client: trpcClient,
    queryClient,
  })
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <Suspense fallback={null}>{children}</Suspense>
      </TRPCProvider>
    </QueryClientProvider>
  )
  return { queryClient, trpc, Wrapper }
}
