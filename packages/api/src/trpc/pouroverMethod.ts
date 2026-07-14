import { db } from '../db'
import { pouroverMethods } from '../db/schema'
import { insertPouroverMethodSchema } from '../db/zod'
import { authedProcedure, createTRPCRouter } from './init'

export const pouroverMethodRouter = createTRPCRouter({
  list: authedProcedure.query(async ({ ctx }) => {
    return db.query.pouroverMethods.findMany({
      where: {
        OR: [{ userId: { isNull: true } }, { userId: ctx.session.user.id }],
      },
      orderBy: { name: 'asc' },
    })
  }),

  create: authedProcedure
    .input(insertPouroverMethodSchema)
    .mutation(async ({ ctx, input }) => {
      const [method] = await db
        .insert(pouroverMethods)
        .values({ ...input, userId: ctx.session.user.id })
        .returning()
      return method
    }),
})
