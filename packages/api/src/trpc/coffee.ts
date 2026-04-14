import { count, eq } from 'drizzle-orm'
import { db } from '@/db'
import { coffees } from '@/db/schema'
import { insertCoffeeSchema } from '@/db/zod'
import z from 'zod'
import { authedProcedure, createTRPCRouter } from './init'

export const coffeeRouter = createTRPCRouter({
  getAll: authedProcedure.query(async ({ ctx }) => {
    return db.query.coffees.findMany({
      where: { userId: ctx.session.user.id },
    })
  }),

  getRecent: authedProcedure
    .input(z.object({ limit: z.number().min(1).max(50), offset: z.number().min(0) }))
    .query(async ({ ctx, input }) => {
      const [items, [{ total }]] = await Promise.all([
        db.query.coffees.findMany({
          where: { userId: ctx.session.user.id },
          orderBy: { createdAt: 'desc' },
          limit: input.limit,
          offset: input.offset,
        }),
        db.select({ total: count() }).from(coffees).where(eq(coffees.userId, ctx.session.user.id)),
      ])
      return { items, total }
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
