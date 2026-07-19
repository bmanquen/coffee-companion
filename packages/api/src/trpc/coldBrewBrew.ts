import { and, eq } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import z from 'zod'
import { db } from '../db'
import { coldBrewBrews } from '../db/schema'
import { insertColdBrewBrewSchema } from '../db/zod'
import { COLD_BREW_DEVICE_TYPE, isColdBrewDevice } from '../lib/cold-brew'
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
  getAll: authedProcedure.query(async ({ ctx }) => {
    return db.query.coldBrewBrews.findMany({
      where: { userId: ctx.session.user.id },
      orderBy: { createdAt: 'desc' },
      with: withRelations,
    })
  }),

  getById: authedProcedure.input(z.uuid()).query(async ({ ctx, input }) => {
    const brew = await db.query.coldBrewBrews.findFirst({
      where: { id: input, userId: ctx.session.user.id },
    })
    if (!brew) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Brew not found' })
    }
    return brew
  }),

  create: authedProcedure
    .input(insertColdBrewBrewSchema)
    .mutation(async ({ ctx, input }) => {
      await assertColdBrewDevice(input.brewingDeviceId, ctx.session.user.id)

      const [brew] = await db
        .insert(coldBrewBrews)
        .values({ ...input, userId: ctx.session.user.id })
        .returning()
      return brew
    }),

  // Brews that are the dialed-in reference for their coffee, most recent first.
  // An optional limit caps the result; omitting it returns all of them.
  getDialedIn: authedProcedure
    .input(z.object({ limit: z.number().min(1).max(50).optional() }).optional())
    .query(async ({ ctx, input }) => {
      return db.query.coldBrewBrews.findMany({
        where: { userId: ctx.session.user.id, isDialedIn: true },
        orderBy: { createdAt: 'desc' },
        with: withRelations,
        limit: input?.limit,
      })
    }),

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
          await tx
            .update(coldBrewBrews)
            .set({ isDialedIn: true })
            .where(
              and(
                eq(coldBrewBrews.id, input.brewId),
                eq(coldBrewBrews.userId, userId),
              ),
            )
        }
      })
    }),
})
