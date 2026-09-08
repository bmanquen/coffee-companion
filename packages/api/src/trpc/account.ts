import { db } from '../db'
import { authedProcedure, createTRPCRouter } from './init'

// Creates accept any coffeeId/grinderId; only include nested rows this user owns.
const brewWith = (userId: string) =>
  ({
    coffee: { where: { userId } },
    grinder: { where: { userId } },
    brewingDevice: { with: { type: true } },
  }) as const

const brewWithMethod = (userId: string) =>
  ({
    ...brewWith(userId),
    method: true,
  }) as const

function accountOf(row: {
  id: string
  name: string
  email: string
  emailVerified: boolean
  image?: string | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerified: row.emailVerified,
    image: row.image ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export const accountRouter = createTRPCRouter({
  // Stored rows, not the Sealed reading view — GDPR Art. 15/20, ADR-0004.
  export: authedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id

    const [
      row,
      coffeeRows,
      espresso,
      aeropress,
      pourover,
      frenchPress,
      coldBrew,
    ] = await Promise.all([
      db.query.user.findFirst({ where: { id: userId } }),
      db.query.coffees.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        with: {
          country: true,
          region: true,
          process: true,
          roaster: true,
          roastLevel: true,
          coffeesVarieties: { with: { variety: true } },
        },
      }),
      db.query.espressoShots.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        with: brewWith(userId),
      }),
      db.query.aeropressBrews.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        with: brewWithMethod(userId),
      }),
      db.query.pouroverBrews.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        with: brewWithMethod(userId),
      }),
      db.query.frenchpressBrews.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        with: brewWithMethod(userId),
      }),
      db.query.coldBrewBrews.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        with: brewWith(userId),
      }),
    ])

    return {
      user: accountOf(row ?? ctx.session.user),
      coffees: coffeeRows.map(({ coffeesVarieties, ...coffee }) => ({
        ...coffee,
        varieties: coffeesVarieties.map((cv) => cv.variety),
      })),
      brews: { espresso, aeropress, pourover, frenchPress, coldBrew },
    }
  }),
})
