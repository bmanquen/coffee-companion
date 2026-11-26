import { TRPCError } from '@trpc/server'
import z from 'zod'
import { db } from '../db'
import { insertRegionSchema } from '../db/zod'
import { regions } from '../db/schema'
import { authedProcedure, createTRPCRouter } from './init'

export const regionRouter = createTRPCRouter({
  getAll: authedProcedure.input(z.uuid()).query(async ({ ctx, input }) => {
    return db.query.regions.findMany({
      where: {
        countryId: input,
        OR: [{ userId: { isNull: true } }, { userId: ctx.session.user.id }],
      },
    })
  }),

  create: authedProcedure
    .input(insertRegionSchema)
    .mutation(async ({ ctx, input }) => {
      // The country must be shared or the caller's own, so a region cannot
      // point at another user's private country.
      if (input.countryId) {
        const country = await db.query.countries.findFirst({
          where: {
            id: input.countryId,
            OR: [{ userId: { isNull: true } }, { userId: ctx.session.user.id }],
          },
          columns: { id: true },
        })
        if (!country) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Country not found' })
        }
      }
      const [region] = await db.insert(regions).values({ ...input, userId: ctx.session.user.id }).returning()
      return region
    }),
})
