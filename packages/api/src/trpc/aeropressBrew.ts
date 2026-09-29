import { and, count, eq } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import z from 'zod'
import { db } from '../db'
import { aeropressBrews } from '../db/schema'
import { insertAeropressBrewSchema } from '../db/zod'
import { AEROPRESS_DEVICE_TYPE, isAeropressDevice } from '../lib/aeropress'
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

// AeroPress brews must be brewed on an AeroPress-type device. Throws if the
// device is missing, owned by another user, or not an aeropress device.
async function assertAeropressDevice(brewingDeviceId: string, userId: string) {
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
  if (!isAeropressDevice(device)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `AeroPress brews require an ${AEROPRESS_DEVICE_TYPE} brewing device`,
    })
  }
}

// The method must be a system default (null userId) or owned by the user.
async function assertAeropressMethod(methodId: string, userId: string) {
  const method = await db.query.aeropressMethods.findFirst({
    where: {
      id: methodId,
      OR: [{ userId: { isNull: true } }, { userId }],
    },
  })
  if (!method) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Method not found' })
  }
}

export const aeropressBrewRouter = createTRPCRouter({
  getAll: authedProcedure.query(({ ctx }) =>
    sealBrewsWithDialedIn(ctx.session.user.id, ctx.shelf, () =>
      db.query.aeropressBrews.findMany({
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
          db.query.aeropressBrews.findMany({
            where: { userId: ctx.session.user.id },
            orderBy: { createdAt: 'desc' },
            with: withRelations,
            limit: input.limit,
            offset: input.offset,
          }),
          db
            .select({ total: count() })
            .from(aeropressBrews)
            .where(eq(aeropressBrews.userId, ctx.session.user.id)),
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
      const ids = await brewIdsForMethod(ctx.session.user.id, 'aeropress')
      if (ids.length === 0) return []
      return sealBrewsWithDialedIn(ctx.session.user.id, ctx.shelf, () =>
        db.query.aeropressBrews.findMany({
          where: { userId: ctx.session.user.id, id: { in: ids } },
          orderBy: { createdAt: 'desc' },
          with: withRelations,
          limit: input?.limit,
        }),
      )
    }),

  getById: authedProcedure.input(z.uuid()).query(({ ctx, input }) =>
    sealBrewWithDialedIn(ctx.session.user.id, ctx.shelf, async () => {
      const brew = await db.query.aeropressBrews.findFirst({
        where: { id: input, userId: ctx.session.user.id },
      })
      if (!brew) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Brew not found' })
      }
      return brew
    }),
  ),

  create: authedProcedure
    .input(insertAeropressBrewSchema)
    .mutation(async ({ ctx, input }) => {
      await assertAeropressDevice(input.brewingDeviceId, ctx.session.user.id)
      await assertAeropressMethod(input.methodId, ctx.session.user.id)

      await stampFallenBrews(ctx.session.user.id, ctx.plan)

      const [brew] = await db
        .insert(aeropressBrews)
        .values({ ...input, userId: ctx.session.user.id })
        .returning()
      return brew
    }),

  update: authedProcedure
    .input(insertAeropressBrewSchema.extend({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input

      // A Sealed Brew reaches the form with its settings withheld, so saving it
      // would write those blanks over what is stored.
      const existing = await db.query.aeropressBrews.findFirst({
        where: { id, userId: ctx.session.user.id },
      })
      if (existing && isSealed(existing, await ctx.shelf())) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'This Brew is Sealed. Subscribe to read and edit it again.',
        })
      }
      await assertAeropressDevice(data.brewingDeviceId, ctx.session.user.id)
      await assertAeropressMethod(data.methodId, ctx.session.user.id)

      const updated = await db
        .update(aeropressBrews)
        .set(data)
        .where(
          and(
            eq(aeropressBrews.id, id),
            eq(aeropressBrews.userId, ctx.session.user.id),
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
      .delete(aeropressBrews)
      .where(
        and(
          eq(aeropressBrews.id, input),
          eq(aeropressBrews.userId, ctx.session.user.id),
        ),
      )
      .returning()
    if (deleted.length === 0) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Brew not found' })
    }
    return deleted[0]
  }),
})
