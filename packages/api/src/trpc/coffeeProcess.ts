import { db } from '@/db'
import { coffeeProcesses } from '@/db/schema'
import { insertCoffeeProcessSchema } from '@/db/zod'
import { authedProcedure, createTRPCRouter } from './init'

export const coffeeProcessRouter = createTRPCRouter({
  getAll: authedProcedure.query(async ({ ctx }) => {
    return db.query.coffeeProcesses.findMany({
      where: {
        OR: [{ userId: { isNull: true } }, { userId: ctx.session.user.id }],
      },
      orderBy: { name: 'asc' },
    })
  }),

  create: authedProcedure
    .input(insertCoffeeProcessSchema)
    .mutation(async ({ ctx, input }) => {
      const [process] = await db
        .insert(coffeeProcesses)
        .values({ ...input, userId: ctx.session.user.id })
        .returning()
      return process
    }),
})
