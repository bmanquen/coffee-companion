import { and, count, eq } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import z from 'zod'
import { db } from '../db'
import { coffees, espressoShots } from '../db/schema'
import { insertCoffeeSchema } from '../db/zod'
import { authedProcedure, createTRPCRouter } from './init'

export const coffeeRouter = createTRPCRouter({
  getAll: authedProcedure.query(async ({ ctx }) => {
    const rows = await db.query.coffees.findMany({
      where: { userId: ctx.session.user.id },
      orderBy: { updatedAt: 'desc' },
      with: {
        country: true,
        region: true,
        process: true,
        roaster: true,
        roastLevel: true,
        // Varieties are a many-to-many via the join table; flatten below.
        coffeesVarieties: { with: { variety: true } },
        // The coffee's dialed-in espresso shot, if one is set.
        espressoShots: { where: { isDialedIn: true }, limit: 1 },
      },
    })
    return rows.map(
      ({ espressoShots: dialedIn, coffeesVarieties, ...coffee }) => ({
        ...coffee,
        varieties: coffeesVarieties.map((cv) => cv.variety),
        dialedInShot: dialedIn.at(0) ?? null,
      }),
    )
  }),

  getById: authedProcedure.input(z.uuid()).query(async ({ ctx, input }) => {
    const coffee = await db.query.coffees.findFirst({
      where: { id: input, userId: ctx.session.user.id },
    })
    if (!coffee) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Coffee not found' })
    }
    return coffee
  }),

  getRecent: authedProcedure
    .input(
      z.object({ limit: z.number().min(1).max(50), offset: z.number().min(0) }),
    )
    .query(async ({ ctx, input }) => {
      const [items, [{ total }]] = await Promise.all([
        db.query.coffees.findMany({
          where: { userId: ctx.session.user.id },
          orderBy: { createdAt: 'desc' },
          limit: input.limit,
          offset: input.offset,
        }),
        db
          .select({ total: count() })
          .from(coffees)
          .where(eq(coffees.userId, ctx.session.user.id)),
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

  update: authedProcedure
    .input(insertCoffeeSchema.extend({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input
      const updated = await db
        .update(coffees)
        .set(data)
        .where(and(eq(coffees.id, id), eq(coffees.userId, ctx.session.user.id)))
        .returning()
      if (updated.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Coffee not found' })
      }
      return updated[0]
    }),

  delete: authedProcedure
    .input(z.uuid())
    .mutation(async ({ ctx, input }) => {
      const deleted = await db
        .delete(coffees)
        .where(
          and(eq(coffees.id, input), eq(coffees.userId, ctx.session.user.id)),
        )
        .returning()
      if (deleted.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Coffee not found' })
      }
      return deleted[0]
    }),

  setDialedIn: authedProcedure
    .input(z.object({ coffeeId: z.string(), shotId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      await db.transaction(async (tx) => {
        // Clear the coffee's current dialed-in espresso shot, if any. The
        // partial unique index allows only one dialed-in shot per coffee, so
        // this must run before flagging a new one.
        await tx
          .update(espressoShots)
          .set({ isDialedIn: false })
          .where(
            and(
              eq(espressoShots.coffeeId, input.coffeeId),
              eq(espressoShots.userId, userId),
              eq(espressoShots.isDialedIn, true),
            ),
          )
        if (input.shotId) {
          await tx
            .update(espressoShots)
            .set({ isDialedIn: true })
            .where(
              and(
                eq(espressoShots.id, input.shotId),
                eq(espressoShots.userId, userId),
              ),
            )
        }
      })
    }),
})
