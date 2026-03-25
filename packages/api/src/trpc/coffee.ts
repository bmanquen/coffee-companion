import { db } from '@/db'
import { coffees } from '@/db/schema'
import { insertCoffeeSchema } from '@/db/zod'
import { authedProcedure, createTRPCRouter } from './init'

export const coffeeRouter = createTRPCRouter({
  getAll: authedProcedure.query(async ({ ctx }) => {
    return db.query.coffees.findMany({
      where: { userId: ctx.session.user.id },
    })
  }),

  create: authedProcedure
    .input(insertCoffeeSchema)
    .mutation(async ({ ctx, input }) => {
      const [coffee] = await db
        .insert(coffees)
        .values({ ...input, userId: ctx.session.user.id })
        .returning()
      return coffee
    }),
})
