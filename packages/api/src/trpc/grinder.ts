import { db } from '../db'
import { grinders } from '../db/schema'
import { insertGrinderSchema } from '../db/zod'
import { authedProcedure, createTRPCRouter } from './init'

export const grinderRouter = createTRPCRouter({
  list: authedProcedure.query(async ({ ctx }) => {
    return db.query.grinders.findMany({
      where: { userId: ctx.session.user.id },
      orderBy: { name: 'asc' },
    })
  }),

  create: authedProcedure
    .input(insertGrinderSchema)
    .mutation(async ({ ctx, input }) => {
      const [grinder] = await db
        .insert(grinders)
        .values({ ...input, userId: ctx.session.user.id })
        .returning()
      return grinder
    }),
})
