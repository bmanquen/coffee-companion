import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createTRPCClient, httpBatchStreamLink } from '@trpc/client'
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query'
import superjson from 'superjson'
import { Suspense } from 'react'
import type { ReactNode } from 'react'
import type { TRPCRouter } from '@coffee-companion/api/trpc/router'
import { TRPCProvider } from '@/integrations/trpc/react'

// A throwaway client; tests pre-seed the query cache so it's never called.
const trpcClient = createTRPCClient<TRPCRouter>({
  links: [
    httpBatchStreamLink({
      transformer: superjson,
      url: 'http://localhost/api/trpc',
    }),
  ],
})

// Builds an isolated QueryClient + matching tRPC proxy and a Wrapper that
// provides both (with a Suspense boundary for useSuspenseQuery). Seed the cache
// via `queryClient.setQueryData(trpc.x.y.queryKey(input), data)`.
export function createTestProviders() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
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
