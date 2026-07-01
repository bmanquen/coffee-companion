import { and, eq } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import z from 'zod'
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

  getById: authedProcedure.input(z.uuid()).query(async ({ ctx, input }) => {
    const grinder = await db.query.grinders.findFirst({
      where: { id: input, userId: ctx.session.user.id },
    })
    if (!grinder) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Grinder not found',
      })
    }
    return grinder
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

  update: authedProcedure
    .input(insertGrinderSchema.extend({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input
      const updated = await db
        .update(grinders)
        .set(data)
        .where(
          and(eq(grinders.id, id), eq(grinders.userId, ctx.session.user.id)),
        )
        .returning()
      if (updated.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Grinder not found',
        })
      }
      return updated[0]
    }),

  delete: authedProcedure
    .input(z.uuid())
    .mutation(async ({ ctx, input }) => {
      const deleted = await db
        .delete(grinders)
        .where(
          and(eq(grinders.id, input), eq(grinders.userId, ctx.session.user.id)),
        )
        .returning()
      if (deleted.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Grinder not found',
        })
      }
      return deleted[0]
    }),
})
