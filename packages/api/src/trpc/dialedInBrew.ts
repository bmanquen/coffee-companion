import { z } from 'zod'
import {
  brewingMethods,
  getDialedInBrews,
  listDialedInBrews,
  setDialedInBrew,
  unsetDialedInBrew,
} from '../lib/dialed-in-brew'
import { authedProcedure, createTRPCRouter } from './init'

const brewingMethodSchema = z.enum(brewingMethods)

const tripleKey = z.object({
  coffeeId: z.uuid(),
  brewingMethod: brewingMethodSchema,
  brewingDeviceId: z.uuid(),
})

export const dialedInBrewRouter = createTRPCRouter({
  list: authedProcedure.query(({ ctx }) =>
    listDialedInBrews(ctx.session.user.id),
  ),

  get: authedProcedure.input(tripleKey).query(async ({ ctx, input }) =>
    getDialedInBrews(ctx.session.user.id, input, await ctx.shelf()),
  ),

  // Make this brew the Dialed-in brew for its coffee × method × device.
  // A second mark for the same triple replaces the current one.
  set: authedProcedure
    .input(
      z.object({
        brewingMethod: brewingMethodSchema,
        brewingDeviceId: z.uuid(),
        brewId: z.uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      setDialedInBrew(
        ctx.session.user.id,
        input.brewingMethod,
        input.brewingDeviceId,
        input.brewId,
        await ctx.shelf(),
      ),
    ),

  // Clear this brew if it is the current Dialed-in brew. Other triples stay.
  unset: authedProcedure
    .input(z.object({ brewId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      await unsetDialedInBrew(ctx.session.user.id, input.brewId)
    }),
})
