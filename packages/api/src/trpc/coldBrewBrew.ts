import { and, count, eq } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import z from 'zod'
import { db } from '../db'
import { coldBrewBrews } from '../db/schema'
import { insertColdBrewBrewSchema } from '../db/zod'
import { COLD_BREW_DEVICE_TYPE, isColdBrewDevice } from '../lib/cold-brew'
import {
  isSealed,
  sealBrew,
  sealBrewPage,
  sealBrews,
  stampFallenBrews,
} from '../lib/shelf'
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
    sealBrews(ctx.shelf, () =>
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
      sealBrewPage(ctx.shelf, async () => {
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
    sealBrew(ctx.shelf, async () => {
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

  // Brews that are the dialed-in reference for their coffee, most recent first.
  // An optional limit caps the result; omitting it returns all of them.
  getDialedIn: authedProcedure
    .input(z.object({ limit: z.number().min(1).max(50).optional() }).optional())
    .query(({ ctx, input }) =>
      sealBrews(ctx.shelf, () =>
        db.query.coldBrewBrews.findMany({
          where: { userId: ctx.session.user.id, isDialedIn: true },
          orderBy: { createdAt: 'desc' },
          with: withRelations,
          limit: input?.limit,
        }),
      ),
    ),

  // Set (or clear, with brewId null) the dialed-in cold brew for a coffee.
  // Cold brew is methodless (ADR-0001), so this is scoped to the coffee alone —
  // at most one dialed-in cold brew per coffee — and never touches another
  // method's dialed-in brew for the same coffee.
  setDialedIn: authedProcedure
    .input(
      z.object({
        coffeeId: z.uuid(),
        brewId: z.uuid().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      // A Sealed Brew cannot become the reference to reproduce: its settings
      // are not readable, so it would arrive as a Sealed row nobody can act on.
      if (input.brewId) {
        const target = await db.query.coldBrewBrews.findFirst({
          where: { id: input.brewId, userId },
        })
        if (target && isSealed(target, await ctx.shelf())) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'This Brew is Sealed. Subscribe to dial it in again.',
          })
        }
      }
      await db.transaction(async (tx) => {
        await tx
          .update(coldBrewBrews)
          .set({ isDialedIn: false })
          .where(
            and(
              eq(coldBrewBrews.coffeeId, input.coffeeId),
              eq(coldBrewBrews.userId, userId),
              eq(coldBrewBrews.isDialedIn, true),
            ),
          )
        if (input.brewId) {
          // Constrain the set to the same coffee: a brewId belonging to a
          // different coffee must not be flagged here, or that coffee's existing
          // dialed-in brew would be left untouched and trip the per-coffee unique
          // index with a raw DB error. On a mismatch no row updates; throw so the
          // transaction rolls back the clear above and the caller gets a clean
          // NOT_FOUND. Cold brew is methodless (ADR-0001), so this is scoped to
          // the coffee alone.
          const updated = await tx
            .update(coldBrewBrews)
            .set({ isDialedIn: true })
            .where(
              and(
                eq(coldBrewBrews.id, input.brewId),
                eq(coldBrewBrews.userId, userId),
                eq(coldBrewBrews.coffeeId, input.coffeeId),
              ),
            )
            .returning()
          if (updated.length === 0) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Brew not found for this coffee',
            })
          }
        }
      })
    }),
})
