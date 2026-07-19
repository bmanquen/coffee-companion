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
})
