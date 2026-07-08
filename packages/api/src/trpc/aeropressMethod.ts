import { db } from '../db'
import { aeropressMethods } from '../db/schema'
import { insertAeropressMethodSchema } from '../db/zod'
import { authedProcedure, createTRPCRouter } from './init'

export const aeropressMethodRouter = createTRPCRouter({
  list: authedProcedure.query(async ({ ctx }) => {
    return db.query.aeropressMethods.findMany({
      where: {
        OR: [{ userId: { isNull: true } }, { userId: ctx.session.user.id }],
      },
      orderBy: { name: 'asc' },
    })
  }),

  create: authedProcedure
    .input(insertAeropressMethodSchema)
    .mutation(async ({ ctx, input }) => {
      const [method] = await db
        .insert(aeropressMethods)
        .values({ ...input, userId: ctx.session.user.id })
        .returning()
      return method
    }),
})
