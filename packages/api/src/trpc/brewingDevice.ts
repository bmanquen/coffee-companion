import { and, eq } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import z from 'zod'
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

  getById: authedProcedure.input(z.uuid()).query(async ({ ctx, input }) => {
    const device = await db.query.brewingDevices.findFirst({
      where: { id: input, userId: ctx.session.user.id },
    })
    if (!device) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Brewing device not found',
      })
    }
    return device
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

  update: authedProcedure
    .input(insertBrewingDeviceSchema.extend({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input
      const updated = await db
        .update(brewingDevices)
        .set(data)
        .where(
          and(
            eq(brewingDevices.id, id),
            eq(brewingDevices.userId, ctx.session.user.id),
          ),
        )
        .returning()
      if (updated.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Brewing device not found',
        })
      }
      return updated[0]
    }),

  delete: authedProcedure
    .input(z.uuid())
    .mutation(async ({ ctx, input }) => {
      const deleted = await db
        .delete(brewingDevices)
        .where(
          and(
            eq(brewingDevices.id, input),
            eq(brewingDevices.userId, ctx.session.user.id),
          ),
        )
        .returning()
      if (deleted.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Brewing device not found',
        })
      }
      return deleted[0]
    }),
})
