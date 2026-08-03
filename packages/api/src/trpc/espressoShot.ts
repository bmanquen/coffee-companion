import { and, count, eq } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import z from 'zod'
import { db } from '../db'
import { espressoShots } from '../db/schema'
import { insertEspressoShotSchema } from '../db/zod'
import { ESPRESSO_DEVICE_TYPE, isEspressoDevice } from '../lib/espresso'
import {
  isSealed,
  sealBrew,
  sealBrewPage,
  sealBrews,
  stampFallenBrews,
} from '../lib/shelf'
import { authedProcedure, createTRPCRouter } from './init'

// Espresso shots must be brewed on an Espresso-type device. Throws if the
// device is missing, owned by another user, or not an espresso device.
async function assertEspressoDevice(brewingDeviceId: string, userId: string) {
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
  if (!isEspressoDevice(device)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Espresso shots require an ${ESPRESSO_DEVICE_TYPE} brewing device`,
    })
  }
}

export const espressoShotRouter = createTRPCRouter({
  getAll: authedProcedure.query(({ ctx }) =>
    sealBrews(ctx.shelf, () =>
      db.query.espressoShots.findMany({
        where: { userId: ctx.session.user.id },
        orderBy: { createdAt: 'desc' },
        with: {
          coffee: true,
          grinder: true,
          brewingDevice: { with: { type: true } },
        },
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
          db.query.espressoShots.findMany({
            where: { userId: ctx.session.user.id },
            orderBy: { createdAt: 'desc' },
            with: {
              coffee: true,
              grinder: true,
              brewingDevice: { with: { type: true } },
            },
            limit: input.limit,
            offset: input.offset,
          }),
          db
            .select({ total: count() })
            .from(espressoShots)
            .where(eq(espressoShots.userId, ctx.session.user.id)),
        ])
        return { items, total }
      }),
    ),

  // Shots that are the dialed-in reference for their coffee, most recent first.
  // An optional limit caps the result (the dashboard asks for a handful);
  // omitting it returns every dialed-in shot. A Sealed one is blanked like any
  // other Brew rather than dropped: it is still the coffee's reference shot,
  // and the user is owed the sight of what subscribing would reopen.
  getDialedIn: authedProcedure
    .input(z.object({ limit: z.number().min(1).max(50).optional() }).optional())
    .query(({ ctx, input }) =>
      sealBrews(ctx.shelf, () =>
        db.query.espressoShots.findMany({
          where: { userId: ctx.session.user.id, isDialedIn: true },
          orderBy: { createdAt: 'desc' },
          with: {
            coffee: true,
            grinder: true,
            brewingDevice: { with: { type: true } },
          },
          limit: input?.limit,
        }),
      ),
    ),

  // Sealed here too: the edit form would otherwise hand back every setting the
  // feeds withhold.
  getById: authedProcedure.input(z.uuid()).query(({ ctx, input }) =>
    sealBrew(ctx.shelf, async () => {
      const shot = await db.query.espressoShots.findFirst({
        where: { id: input, userId: ctx.session.user.id },
      })
      if (!shot) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Shot not found' })
      }
      return shot
    }),
  ),

  create: authedProcedure
    .input(insertEspressoShotSchema)
    .mutation(async ({ ctx, input }) => {
      await assertEspressoDevice(input.brewingDeviceId, ctx.session.user.id)

      await stampFallenBrews(ctx.session.user.id, ctx.plan)

      const [shot] = await db
        .insert(espressoShots)
        .values({ ...input, userId: ctx.session.user.id })
        .returning()
      return shot
    }),

  update: authedProcedure
    .input(insertEspressoShotSchema.extend({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input
      await assertEspressoDevice(data.brewingDeviceId, ctx.session.user.id)

      // A Sealed shot reaches the form with its settings withheld, so saving it
      // would write those blanks over what is stored. Nothing is ever deleted
      // (ADR-0004), so the edit is refused instead.
      const existing = await db.query.espressoShots.findFirst({
        where: { id, userId: ctx.session.user.id },
      })
      if (existing && isSealed(existing, await ctx.shelf())) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message:
            'This Brew is Sealed. Subscribe to read and edit it again.',
        })
      }

      const updated = await db
        .update(espressoShots)
        .set(data)
        .where(
          and(
            eq(espressoShots.id, id),
            eq(espressoShots.userId, ctx.session.user.id),
          ),
        )
        .returning()
      if (updated.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Shot not found' })
      }
      return updated[0]
    }),

  delete: authedProcedure
    .input(z.uuid())
    .mutation(async ({ ctx, input }) => {
      await stampFallenBrews(ctx.session.user.id, ctx.plan)

      const deleted = await db
        .delete(espressoShots)
        .where(
          and(
            eq(espressoShots.id, input),
            eq(espressoShots.userId, ctx.session.user.id),
          ),
        )
        .returning()
      if (deleted.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Shot not found' })
      }
      return deleted[0]
    }),
})
