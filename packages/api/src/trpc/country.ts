import { insertCountrySchema } from '@/db/zod'
import { db } from '../db'
import { countries } from '../db/schema'
import { createTRPCRouter, publicProcedure } from './init'

export const countryRouter = createTRPCRouter({
  list: publicProcedure.query(async () => {
    return db.query.countries.findMany({
      orderBy: (countries, { asc }) => [asc(countries.name)],
    })
  }),

  create: publicProcedure
    .input(insertCountrySchema)
    .mutation(async ({ input }) => {
      const [country] = await db.insert(countries).values(input).returning()
      return country
    }),
})
