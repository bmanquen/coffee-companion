import { db } from '@/db'
import { insertRegionSchema } from '@/db/zod'
import { regions } from '@/db/schema'
import z from 'zod'
import { authedProcedure, createTRPCRouter, publicProcedure } from './init'

export const regionRouter = createTRPCRouter({
  getAll: publicProcedure.input(z.uuid()).query(async ({ input }) => {
    return db.query.regions.findMany({ where: { countryId: input } })
  }),

  create: authedProcedure
    .input(insertRegionSchema)
    .mutation(async ({ input }) => {
      const [region] = await db.insert(regions).values(input).returning()
      return region
    }),
})
