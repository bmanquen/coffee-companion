import { createTRPCContext } from '@trpc/tanstack-react-query'
import type { TRPCRouter } from '@coffee-companion/api/trpc/router'

export const { TRPCProvider, useTRPC } = createTRPCContext<TRPCRouter>()
