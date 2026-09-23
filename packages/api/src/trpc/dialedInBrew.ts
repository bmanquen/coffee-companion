import { z } from 'zod'
import {
  brewingMethods,
  getDialedInBrew,
  listDialedInBrews,
  setDialedInBrew,
} from '../lib/dialed-in-brew'
import { authedProcedure, createTRPCRouter } from './init'

const brewingMethodSchema = z.enum(brewingMethods)

const pairInput = z.object({
  brewingMethod: brewingMethodSchema,
  brewingDeviceId: z.uuid(),
})

export const dialedInBrewRouter = createTRPCRouter({
  list: authedProcedure.query(({ ctx }) =>
    listDialedInBrews(ctx.session.user.id),
  ),

  get: authedProcedure.input(pairInput).query(async ({ ctx, input }) =>
    getDialedInBrew(ctx.session.user.id, input, await ctx.shelf()),
  ),

  // Set or clear (brewId null) the Dialed-in Brew for a method × device pair.
  // At most one mapping per pair; setting replaces. The brew must belong to
  // this user, this method, and this device.
  set: authedProcedure
    .input(pairInput.extend({ brewId: z.uuid().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const { brewId, ...pair } = input
      return setDialedInBrew(
        ctx.session.user.id,
        pair,
        brewId,
        await ctx.shelf(),
      )
    }),
})
