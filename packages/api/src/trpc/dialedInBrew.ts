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

const setKey = z.object({
  coffeeId: z.uuid(),
  brewingMethod: brewingMethodSchema,
  brewingDeviceId: z.uuid(),
})

export const dialedInBrewRouter = createTRPCRouter({
  list: authedProcedure.query(({ ctx }) =>
    listDialedInBrews(ctx.session.user.id),
  ),

  get: authedProcedure.input(setKey).query(async ({ ctx, input }) =>
    getDialedInBrews(ctx.session.user.id, input, await ctx.shelf()),
  ),

  // Add this brew to its coffee × method × device set. Idempotent: marking a
  // brew that is already a member leaves the rest of the set untouched.
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

  // Remove only this brew from its set. Other members stay marked.
  unset: authedProcedure
    .input(z.object({ brewId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      await unsetDialedInBrew(ctx.session.user.id, input.brewId)
    }),
})
