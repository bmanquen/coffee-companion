import { db } from '../db'
import { brewingDeviceTypes } from '../db/schema'
import { insertBrewingDeviceTypeSchema } from '../db/zod'
import { authedProcedure, createTRPCRouter } from './init'

export const brewingDeviceTypeRouter = createTRPCRouter({
  list: authedProcedure.query(async ({ ctx }) => {
    return db.query.brewingDeviceTypes.findMany({
      where: {
        OR: [{ userId: { isNull: true } }, { userId: ctx.session.user.id }],
      },
      orderBy: { name: 'asc' },
    })
  }),

  create: authedProcedure
    .input(insertBrewingDeviceTypeSchema)
    .mutation(async ({ ctx, input }) => {
      const [type] = await db
        .insert(brewingDeviceTypes)
        .values({ ...input, userId: ctx.session.user.id })
        .returning()
      return type
    }),
})
