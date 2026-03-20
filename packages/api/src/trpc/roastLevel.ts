import { db } from '@/db'
import { roastLevels } from '@/db/schema'
import { insertRoastLevelSchema } from '@/db/zod'
import { authedProcedure, createTRPCRouter, publicProcedure } from './init'

export const roastLevelRouter = createTRPCRouter({
  list: publicProcedure.query(async () => {
    return db.query.roastLevels.findMany()
  }),

  create: authedProcedure
    .input(insertRoastLevelSchema)
    .mutation(async ({ input }) => {
      const [roastLevel] = await db
        .insert(roastLevels)
        .values(input)
        .returning()
      return roastLevel
    }),
})
