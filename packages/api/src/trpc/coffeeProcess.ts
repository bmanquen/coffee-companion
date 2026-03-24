import { db } from '@/db'
import { coffeeProcesses } from '@/db/schema'
import { insertCoffeeProcessSchema } from '@/db/zod'
import { authedProcedure, createTRPCRouter, publicProcedure } from './init'

export const coffeeProcessRouter = createTRPCRouter({
  getAll: publicProcedure.query(async () => {
    return db.query.coffeeProcesses.findMany()
  }),

  create: authedProcedure
    .input(insertCoffeeProcessSchema)
    .mutation(async ({ input }) => {
      const [process] = await db
        .insert(coffeeProcesses)
        .values(input)
        .returning()
      return process
    }),
})
