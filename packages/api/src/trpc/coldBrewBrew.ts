import { and, count, eq } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import z from 'zod'
import { db } from '../db'
import { coldBrewBrews } from '../db/schema'
import { insertColdBrewBrewSchema } from '../db/zod'
import { COLD_BREW_DEVICE_TYPE, isColdBrewDevice } from '../lib/cold-brew'
import {
  brewIdsForMethod,
  sealBrewPageWithDialedIn,
  sealBrewWithDialedIn,
  sealBrewsWithDialedIn,
} from '../lib/dialed-in-brew'
import { isSealed, stampFallenBrews } from '../lib/shelf'
import { authedProcedure, createTRPCRouter } from './init'

// Cold brew is methodless (ADR-0001), so there is no method relation here.
const withRelations = {
  coffee: true,
  grinder: true,
  brewingDevice: { with: { type: true } },
} as const

// Cold brews must be brewed on a Cold Brew-type device. Throws if the device is
// missing, owned by another user, or not a cold brew device.
async function assertColdBrewDevice(brewingDeviceId: string, userId: string) {
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
  if (!isColdBrewDevice(device)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Cold brews require a ${COLD_BREW_DEVICE_TYPE} brewing device`,
    })
  }
}

export const coldBrewBrewRouter = createTRPCRouter({
  getAll: authedProcedure.query(({ ctx }) =>
    sealBrewsWithDialedIn(ctx.session.user.id, ctx.shelf, () =>
      db.query.coldBrewBrews.findMany({
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
          db.query.coldBrewBrews.findMany({
            where: { userId: ctx.session.user.id },
            orderBy: { createdAt: 'desc' },
            with: withRelations,
            limit: input.limit,
            offset: input.offset,
          }),
          db
            .select({ total: count() })
            .from(coldBrewBrews)
            .where(eq(coldBrewBrews.userId, ctx.session.user.id)),
        ])
        return { items, total }
      }),
    ),

  getById: authedProcedure.input(z.uuid()).query(({ ctx, input }) =>
    sealBrewWithDialedIn(ctx.session.user.id, ctx.shelf, async () => {
      const brew = await db.query.coldBrewBrews.findFirst({
        where: { id: input, userId: ctx.session.user.id },
      })
      if (!brew) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Brew not found' })
      }
      return brew
    }),
  ),

  create: authedProcedure
    .input(insertColdBrewBrewSchema)
    .mutation(async ({ ctx, input }) => {
      await assertColdBrewDevice(input.brewingDeviceId, ctx.session.user.id)

      await stampFallenBrews(ctx.session.user.id, ctx.plan)

      const [brew] = await db
        .insert(coldBrewBrews)
        .values({ ...input, userId: ctx.session.user.id })
        .returning()
      return brew
    }),

  update: authedProcedure
    .input(insertColdBrewBrewSchema.extend({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input

      // A Sealed Brew reaches the form with its settings withheld, so saving it
      // would write those blanks over what is stored.
      const existing = await db.query.coldBrewBrews.findFirst({
        where: { id, userId: ctx.session.user.id },
      })
      if (existing && isSealed(existing, await ctx.shelf())) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'This Brew is Sealed. Subscribe to read and edit it again.',
        })
      }
      await assertColdBrewDevice(data.brewingDeviceId, ctx.session.user.id)

      const updated = await db
        .update(coldBrewBrews)
        .set(data)
        .where(
          and(
            eq(coldBrewBrews.id, id),
            eq(coldBrewBrews.userId, ctx.session.user.id),
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
      .delete(coldBrewBrews)
      .where(
        and(
          eq(coldBrewBrews.id, input),
          eq(coldBrewBrews.userId, ctx.session.user.id),
        ),
      )
      .returning()
    if (deleted.length === 0) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Brew not found' })
    }
    return deleted[0]
  }),

  // Brews in the Dialed-in set, most recent first. An optional limit caps the
  // result; omitting it returns all of them. A Sealed member is blanked, not
  // dropped.
  getDialedIn: authedProcedure
    .input(z.object({ limit: z.number().min(1).max(50).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const ids = await brewIdsForMethod(ctx.session.user.id, 'coldBrew')
      if (ids.length === 0) return []
      return sealBrewsWithDialedIn(ctx.session.user.id, ctx.shelf, () =>
        db.query.coldBrewBrews.findMany({
          where: { userId: ctx.session.user.id, id: { in: ids } },
          orderBy: { createdAt: 'desc' },
          with: withRelations,
          limit: input?.limit,
        }),
      )
    }),
})
