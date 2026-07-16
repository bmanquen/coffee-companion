import { db } from '../db'
import { frenchpressMethods } from '../db/schema'
import { insertFrenchpressMethodSchema } from '../db/zod'
import { authedProcedure, createTRPCRouter } from './init'

export const frenchpressMethodRouter = createTRPCRouter({
  list: authedProcedure.query(async ({ ctx }) => {
    return db.query.frenchpressMethods.findMany({
      where: {
        OR: [{ userId: { isNull: true } }, { userId: ctx.session.user.id }],
      },
      orderBy: { name: 'asc' },
    })
  }),

  create: authedProcedure
    .input(insertFrenchpressMethodSchema)
    .mutation(async ({ ctx, input }) => {
      const [method] = await db
        .insert(frenchpressMethods)
        .values({ ...input, userId: ctx.session.user.id })
        .returning()
      return method
    }),
})
