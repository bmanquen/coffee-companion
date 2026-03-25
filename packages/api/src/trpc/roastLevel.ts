import { db } from '@/db'
import { roastLevels } from '@/db/schema'
import { insertRoastLevelSchema } from '@/db/zod'
import { authedProcedure, createTRPCRouter } from './init'

export const roastLevelRouter = createTRPCRouter({
  list: authedProcedure.query(async ({ ctx }) => {
    return db.query.roastLevels.findMany({
      where: {
        OR: [{ userId: { isNull: true } }, { userId: ctx.session.user.id }],
      },
      orderBy: { name: 'asc' },
    })
  }),

  create: authedProcedure
    .input(insertRoastLevelSchema)
    .mutation(async ({ ctx, input }) => {
      const [roastLevel] = await db
        .insert(roastLevels)
        .values({ ...input, userId: ctx.session.user.id })
        .returning()
      return roastLevel
    }),
})
