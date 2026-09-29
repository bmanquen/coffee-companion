import { and, count, eq } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import z from 'zod'
import { db } from '../db'
import { pouroverBrews } from '../db/schema'
import { insertPouroverBrewSchema } from '../db/zod'
import { POUR_OVER_DEVICE_TYPE, isPourOverDevice } from '../lib/pourover'
import {
  brewIdsForMethod,
  sealBrewPageWithDialedIn,
  sealBrewWithDialedIn,
  sealBrewsWithDialedIn,
} from '../lib/dialed-in-brew'
import { isSealed, stampFallenBrews } from '../lib/shelf'
import { authedProcedure, createTRPCRouter } from './init'

const withRelations = {
  coffee: true,
  grinder: true,
  brewingDevice: { with: { type: true } },
  method: true,
} as const

// Pour over brews must be brewed on a Pour Over-type device. Throws if the
// device is missing, owned by another user, or not a pour over device.
async function assertPourOverDevice(brewingDeviceId: string, userId: string) {
  const device = await db.query.brewingDevices.findFirst({
    where: { id: brewingDeviceId, userId },
    with: { type: true },
  })
  if (!device) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Brewing device not found',
    })
  }
  if (!isPourOverDevice(device)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Pour over brews require a ${POUR_OVER_DEVICE_TYPE} brewing device`,
    })
  }
}

// The method must be a system default (null userId) or owned by the user.
async function assertPourOverMethod(methodId: string, userId: string) {
  const method = await db.query.pouroverMethods.findFirst({
    where: {
      id: methodId,
      OR: [{ userId: { isNull: true } }, { userId }],
    },
  })
  if (!method) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Method not found' })
  }
}

export const pouroverBrewRouter = createTRPCRouter({
  getAll: authedProcedure.query(({ ctx }) =>
    sealBrewsWithDialedIn(ctx.session.user.id, ctx.shelf, () =>
      db.query.pouroverBrews.findMany({
        where: { userId: ctx.session.user.id },
        orderBy: { createdAt: 'desc' },
        with: withRelations,
      }),
    ),
  ),

  getRecent: authedProcedure
    .input(
      z.object({ limit: z.number().min(1).max(50), offset: z.number().min(0) }),
    )
    .query(({ ctx, input }) =>
      sealBrewPageWithDialedIn(ctx.session.user.id, ctx.shelf, async () => {
        const [items, [{ total }]] = await Promise.all([
          db.query.pouroverBrews.findMany({
            where: { userId: ctx.session.user.id },
            orderBy: { createdAt: 'desc' },
            with: withRelations,
            limit: input.limit,
            offset: input.offset,
          }),
          db
            .select({ total: count() })
            .from(pouroverBrews)
            .where(eq(pouroverBrews.userId, ctx.session.user.id)),
        ])
        return { items, total }
      }),
    ),

  // Brews in the Dialed-in set, most recent first. An optional limit caps the
  // result; omitting it returns all of them. A Sealed member is blanked, not
  // dropped.
  getDialedIn: authedProcedure
    .input(z.object({ limit: z.number().min(1).max(50).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const ids = await brewIdsForMethod(ctx.session.user.id, 'pourover')
      if (ids.length === 0) return []
      return sealBrewsWithDialedIn(ctx.session.user.id, ctx.shelf, () =>
        db.query.pouroverBrews.findMany({
          where: { userId: ctx.session.user.id, id: { in: ids } },
          orderBy: { createdAt: 'desc' },
          with: withRelations,
          limit: input?.limit,
        }),
      )
    }),

  getById: authedProcedure.input(z.uuid()).query(({ ctx, input }) =>
    sealBrewWithDialedIn(ctx.session.user.id, ctx.shelf, async () => {
      const brew = await db.query.pouroverBrews.findFirst({
        where: { id: input, userId: ctx.session.user.id },
      })
      if (!brew) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Brew not found' })
      }
      return brew
    }),
  ),

  create: authedProcedure
    .input(insertPouroverBrewSchema)
    .mutation(async ({ ctx, input }) => {
      await assertPourOverDevice(input.brewingDeviceId, ctx.session.user.id)
      await assertPourOverMethod(input.methodId, ctx.session.user.id)

      await stampFallenBrews(ctx.session.user.id, ctx.plan)

      const [brew] = await db
        .insert(pouroverBrews)
        .values({ ...input, userId: ctx.session.user.id })
        .returning()
      return brew
    }),

  update: authedProcedure
    .input(insertPouroverBrewSchema.extend({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input

      // A Sealed Brew reaches the form with its settings withheld, so saving it
      // would write those blanks over what is stored.
      const existing = await db.query.pouroverBrews.findFirst({
        where: { id, userId: ctx.session.user.id },
      })
      if (existing && isSealed(existing, await ctx.shelf())) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'This Brew is Sealed. Subscribe to read and edit it again.',
        })
      }
      await assertPourOverDevice(data.brewingDeviceId, ctx.session.user.id)
      await assertPourOverMethod(data.methodId, ctx.session.user.id)

      const updated = await db
        .update(pouroverBrews)
        .set(data)
        .where(
          and(
            eq(pouroverBrews.id, id),
            eq(pouroverBrews.userId, ctx.session.user.id),
          ),
        )
        .returning()
      if (updated.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Brew not found' })
      }
      return updated[0]
    }),

  delete: authedProcedure.input(z.uuid()).mutation(async ({ ctx, input }) => {
    await stampFallenBrews(ctx.session.user.id, ctx.plan)

    const deleted = await db
      .delete(pouroverBrews)
      .where(
        and(
          eq(pouroverBrews.id, input),
          eq(pouroverBrews.userId, ctx.session.user.id),
        ),
      )
      .returning()
    if (deleted.length === 0) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Brew not found' })
    }
    return deleted[0]
  }),
})
