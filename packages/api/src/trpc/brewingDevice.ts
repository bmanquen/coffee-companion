import { db } from '../db'
import { brewingDevices } from '../db/schema'
import { insertBrewingDeviceSchema } from '../db/zod'
import { authedProcedure, createTRPCRouter } from './init'

export const brewingDeviceRouter = createTRPCRouter({
  list: authedProcedure.query(async ({ ctx }) => {
    return db.query.brewingDevices.findMany({
      where: { userId: ctx.session.user.id },
      orderBy: { name: 'asc' },
      with: { type: true },
    })
  }),

  create: authedProcedure
    .input(insertBrewingDeviceSchema)
    .mutation(async ({ ctx, input }) => {
      const [device] = await db
        .insert(brewingDevices)
        .values({ ...input, userId: ctx.session.user.id })
        .returning()
      return device
    }),
})
