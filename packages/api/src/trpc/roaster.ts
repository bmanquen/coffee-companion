import { db } from '@/db'
import { roasters } from '@/db/schema'
import { insertRoasterSchema } from '@/db/zod'
import { createTRPCRouter, publicProcedure } from './init'

export const roasterRouter = createTRPCRouter({
  list: publicProcedure.query(async () => {
    return db.query.roasters.findMany({
      orderBy: (roasters, { asc }) => [asc(roasters.name)],
    })
  }),

  create: publicProcedure
    .input(insertRoasterSchema)
    .mutation(async ({ input }) => {
      const [roaster] = await db.insert(roasters).values(input).returning()
      return roaster
    }),
})
