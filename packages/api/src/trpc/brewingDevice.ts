import { and, eq } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import z from 'zod'
import { db } from '../db'
import { brewingDevices } from '../db/schema'
import { insertBrewingDeviceSchema } from '../db/zod'
import { assertRoomForAnother } from '../lib/allowance'
import { visibleDeviceType } from '../lib/brew-ownership'
import { isPgUniqueViolation } from '../lib/pg-error'
import { countBrewsUsing, withStampedShelf } from '../lib/shelf'
import { authedProcedure, createTRPCRouter } from './init'

function rethrowUniqueDeviceConflict(err: unknown): never {
  if (isPgUniqueViolation(err)) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: 'A brewing device with this name already exists',
    })
  }
  throw err
}

export const brewingDeviceRouter = createTRPCRouter({
  list: authedProcedure.query(async ({ ctx }) => {
    return db.query.brewingDevices.findMany({
      // A device written with another user's private type, before create
      // checked it, is left out rather than listed without its type.
      where: {
        userId: ctx.session.user.id,
        type: visibleDeviceType(ctx.session.user.id),
      },
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
      await assertRoomForAnother(
        ctx.plan,
        'brewingDevices',
        ctx.session.user.id,
      )
      try {
        const [device] = await db
          .insert(brewingDevices)
          .values({ ...input, userId: ctx.session.user.id })
          .returning()
        return device
      } catch (err) {
        rethrowUniqueDeviceConflict(err)
      }
    }),

  update: authedProcedure
    .input(insertBrewingDeviceSchema.extend({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input
      const userId = ctx.session.user.id
      // A hidden device takes no Free slot, so giving it a visible type adds
      // one, and must fit the allowance like a create.
      const listed = await db.query.brewingDevices.findFirst({
        columns: { id: true },
        where: { id, userId, type: visibleDeviceType(userId) },
      })
      if (!listed) {
        // A wrong id is not found, whatever the allowance says.
        const owned = await db.query.brewingDevices.findFirst({
          columns: { id: true },
          where: { id, userId },
        })
        if (!owned) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Brewing device not found',
          })
        }
        await assertRoomForAnother(ctx.plan, 'brewingDevices', userId)
      }
      try {
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
      } catch (err) {
        if (err instanceof TRPCError) throw err
        rethrowUniqueDeviceConflict(err)
      }
    }),

  // What deleting it would cascade to, so the confirmation can say so.
  brewCount: authedProcedure
    .input(z.uuid())
    .query(({ ctx, input }) =>
      countBrewsUsing(ctx.session.user.id, 'brewingDeviceId', input),
    ),

  delete: authedProcedure
    .input(z.uuid())
    .mutation(async ({ ctx, input }) => {
      // Its Brews go with it, which can promote a fallen Coffee (ADR-0004).
      const deleted = await withStampedShelf(ctx.session.user.id, ctx.plan, (tx) =>
        tx
          .delete(brewingDevices)
          .where(
            and(
              eq(brewingDevices.id, input),
              eq(brewingDevices.userId, ctx.session.user.id),
            ),
          )
          .returning(),
      )
      if (deleted.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Brewing device not found',
        })
      }
      return deleted[0]
    }),
})
