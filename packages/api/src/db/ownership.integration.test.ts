import { beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { PG_FOREIGN_KEY_VIOLATION, pgErrorIn } from '../lib/pg-error'
import { seedUsers } from '../../test/trpc'
import { db } from '.'
import type { SQL } from 'drizzle-orm'

// The database itself holds every row to the rule that users only use their
// own data or shared lookups, so raw SQL is refused the same as the routers.
const OWNER = 'db-ownership-owner'
const OTHER = 'db-ownership-other'

const LOOKUPS = [
  'countries',
  'regions',
  'farms',
  'roasters',
  'roast_levels',
  'coffee_processes',
  'varieties',
  'brewing_device_types',
  'aeropress_methods',
  'pourover_methods',
  'frenchpress_methods',
] as const
type Lookup = (typeof LOOKUPS)[number]

// Shared rows don't cascade with a user, so this file removes its own.
const sharedIds: Array<{ table: Lookup; id: string }> = []

seedUsers([OWNER, OTHER], async () => {
  for (const { table, id } of [...sharedIds].reverse()) {
    await db.execute(sql`DELETE FROM ${sql.identifier(table)} WHERE id = ${id}`)
  }
})

const name = () => `ownership ${Math.random()}`

async function insertId(query: SQL): Promise<string> {
  const { rows } = await db.execute<{ id: string }>(
    sql`${query} RETURNING id`,
  )
  return rows[0].id
}

function insertLookup(table: Lookup, userId: string | null) {
  return insertId(
    sql`INSERT INTO ${sql.identifier(table)} (user_id, name) VALUES (${userId}, ${name()})`,
  )
}

type Ids = Record<Lookup, string>
const shared = {} as Ids
const own = {} as Ids
const theirs = {} as Ids
const gear = {} as {
  coffee: string
  greenCoffee: string
  grinder: string
  device: string
  theirCoffee: string
  theirGrinder: string
  theirDevice: string
}

beforeAll(async () => {
  for (const table of LOOKUPS) {
    shared[table] = await insertLookup(table, null)
    sharedIds.push({ table, id: shared[table] })
    own[table] = await insertLookup(table, OWNER)
    theirs[table] = await insertLookup(table, OTHER)
  }
  const gearFor = async (userId: string) => ({
    coffee: await insertId(
      sql`INSERT INTO coffees (user_id, name, roaster_id) VALUES (${userId}, ${name()}, ${shared.roasters})`,
    ),
    grinder: await insertId(
      sql`INSERT INTO grinders (user_id, name, brand) VALUES (${userId}, ${name()}, 'B')`,
    ),
    device: await insertId(
      sql`INSERT INTO brewing_devices (user_id, name, brand, type_id) VALUES (${userId}, ${name()}, 'B', ${shared.brewing_device_types})`,
    ),
  })
  const mine = await gearFor(OWNER)
  const other = await gearFor(OTHER)
  Object.assign(gear, mine, {
    greenCoffee: await insertId(
      sql`INSERT INTO green_coffees (user_id, name) VALUES (${OWNER}, ${name()})`,
    ),
    theirCoffee: other.coffee,
    theirGrinder: other.grinder,
    theirDevice: other.device,
  })
})

const ROLLBACK = new Error('rollback')

// Runs the writes and rolls them back, so the cases don't pile up rows that
// collide with each other. Resolves to the error, or null when accepted.
async function attempt(...queries: Array<() => SQL>): Promise<unknown> {
  try {
    await db.transaction(async (tx) => {
      for (const query of queries) await tx.execute(query())
      throw ROLLBACK
    })
  } catch (err) {
    return err === ROLLBACK ? null : err
  }
  return null
}

const refused = (err: unknown) =>
  pgErrorIn(err, PG_FOREIGN_KEY_VIOLATION) !== null

const brew = (table: string, methodId: string) =>
  sql`INSERT INTO ${sql.identifier(table)} (user_id, coffee_id, grinder_id, brewing_device_id, method_id) VALUES (${OWNER}, ${gear.coffee}, ${gear.grinder}, ${gear.device}, ${methodId})`

// Each way a row written by the owner can point at a lookup.
const lookupReferences: Array<{
  reference: string
  lookup: Lookup
  write: (id: string) => SQL
}> = [
  {
    reference: 'coffees.roaster_id',
    lookup: 'roasters',
    write: (id) =>
      sql`INSERT INTO coffees (user_id, name, roaster_id) VALUES (${OWNER}, ${name()}, ${id})`,
  },
  {
    reference: 'coffees.roast_level_id',
    lookup: 'roast_levels',
    write: (id) =>
      sql`INSERT INTO coffees (user_id, name, roast_level_id) VALUES (${OWNER}, ${name()}, ${id})`,
  },
  {
    reference: 'coffee_origins.country_id',
    lookup: 'countries',
    write: (id) =>
      sql`INSERT INTO coffee_origins (coffee_id, country_id) VALUES (${gear.coffee}, ${id})`,
  },
  {
    reference: 'coffee_origins.region_id',
    lookup: 'regions',
    write: (id) =>
      sql`INSERT INTO coffee_origins (coffee_id, country_id, region_id) VALUES (${gear.coffee}, ${shared.countries}, ${id})`,
  },
  {
    reference: 'coffee_origins.process_id',
    lookup: 'coffee_processes',
    write: (id) =>
      sql`INSERT INTO coffee_origins (coffee_id, country_id, process_id) VALUES (${gear.coffee}, ${shared.countries}, ${id})`,
  },
  ...(
    [
      ['country_id', 'countries'],
      ['region_id', 'regions'],
      ['farm_id', 'farms'],
      ['process_id', 'coffee_processes'],
    ] as const
  ).map(([column, lookup]) => ({
    reference: `green_coffees.${column}`,
    lookup,
    write: (id: string) =>
      sql`INSERT INTO green_coffees (user_id, name, ${sql.identifier(column)}) VALUES (${OWNER}, ${name()}, ${id})`,
  })),
  {
    reference: 'coffees_varieties.variety_id',
    lookup: 'varieties',
    write: (id) =>
      sql`INSERT INTO coffees_varieties (coffee_id, variety_id) VALUES (${gear.coffee}, ${id})`,
  },
  {
    reference: 'green_coffees_varieties.variety_id',
    lookup: 'varieties',
    write: (id) =>
      sql`INSERT INTO green_coffees_varieties (green_coffee_id, variety_id) VALUES (${gear.greenCoffee}, ${id})`,
  },
  {
    reference: 'brewing_devices.type_id',
    lookup: 'brewing_device_types',
    write: (id) =>
      sql`INSERT INTO brewing_devices (user_id, name, brand, type_id) VALUES (${OWNER}, ${name()}, 'B', ${id})`,
  },
  {
    reference: 'aeropress_brews.method_id',
    lookup: 'aeropress_methods',
    write: (id) => brew('aeropress_brews', id),
  },
  {
    reference: 'pourover_brews.method_id',
    lookup: 'pourover_methods',
    write: (id) => brew('pourover_brews', id),
  },
  {
    reference: 'frenchpress_brews.method_id',
    lookup: 'frenchpress_methods',
    write: (id) => brew('frenchpress_brews', id),
  },
  {
    reference: 'regions.country_id',
    lookup: 'countries',
    write: (id) =>
      sql`INSERT INTO regions (user_id, name, country_id) VALUES (${OWNER}, ${name()}, ${id})`,
  },
  {
    reference: 'farms.region_id',
    lookup: 'regions',
    write: (id) =>
      sql`INSERT INTO farms (user_id, name, region_id) VALUES (${OWNER}, ${name()}, ${id})`,
  },
]

describe.each(lookupReferences)('$reference', ({ lookup, write }) => {
  it('refuses another user’s private lookup and accepts a shared or own one', async () => {
    expect(refused(await attempt(() => write(theirs[lookup])))).toBe(true)
    expect(await attempt(() => write(shared[lookup]))).toBeNull()
    expect(await attempt(() => write(own[lookup]))).toBeNull()
  })
})

describe('lookup references on update', () => {
  it('refuses moving a reference onto another user’s private lookup', async () => {
    const err = await attempt(
      () =>
        sql`UPDATE coffees SET roast_level_id = ${theirs.roast_levels} WHERE id = ${gear.coffee}`,
    )
    expect(refused(err)).toBe(true)
  })

  it('checks a join row against its new parent’s owner', async () => {
    const err = await attempt(
      () =>
        sql`INSERT INTO coffee_origins (coffee_id, country_id) VALUES (${gear.coffee}, ${own.countries})`,
      () =>
        sql`UPDATE coffee_origins SET coffee_id = ${gear.theirCoffee} WHERE coffee_id = ${gear.coffee} AND country_id = ${own.countries}`,
    )
    expect(refused(err)).toBe(true)
  })

  it('refuses a shared lookup that points at a private one', async () => {
    const err = await attempt(
      () =>
        sql`INSERT INTO regions (user_id, name, country_id) VALUES (NULL, ${name()}, ${own.countries})`,
    )
    expect(refused(err)).toBe(true)
  })
})

describe('owned references', () => {
  const brewTables = [
    'espresso_shots',
    'aeropress_brews',
    'pourover_brews',
    'frenchpress_brews',
    'cold_brew_brews',
  ] as const
  // Brew tables without a method column, plus each method table's own shared
  // method, so only the gear varies.
  const methodOf: Partial<Record<(typeof brewTables)[number], Lookup>> = {
    aeropress_brews: 'aeropress_methods',
    pourover_brews: 'pourover_methods',
    frenchpress_brews: 'frenchpress_methods',
  }
  const brewWith = (
    table: (typeof brewTables)[number],
    ids: { coffee: string; grinder: string; device: string },
  ) => {
    const method = methodOf[table]
    return method
      ? sql`INSERT INTO ${sql.identifier(table)} (user_id, coffee_id, grinder_id, brewing_device_id, method_id) VALUES (${OWNER}, ${ids.coffee}, ${ids.grinder}, ${ids.device}, ${shared[method]})`
      : sql`INSERT INTO ${sql.identifier(table)} (user_id, coffee_id, grinder_id, brewing_device_id) VALUES (${OWNER}, ${ids.coffee}, ${ids.grinder}, ${ids.device})`
  }

  it.each(brewTables)(
    '%s refuses another user’s coffee, grinder or device',
    async (table) => {
      const mine = {
        coffee: gear.coffee,
        grinder: gear.grinder,
        device: gear.device,
      }
      expect(await attempt(() => brewWith(table, mine))).toBeNull()
      for (const swap of [
        { coffee: gear.theirCoffee },
        { grinder: gear.theirGrinder },
        { device: gear.theirDevice },
      ]) {
        const err = await attempt(() => brewWith(table, { ...mine, ...swap }))
        expect(refused(err)).toBe(true)
      }
    },
  )

  it('dialed_in_brews refuses another user’s coffee or device', async () => {
    const mark = (coffee: string, device: string) =>
      sql`INSERT INTO dialed_in_brews (user_id, coffee_id, brewing_method, brewing_device_id, brew_id) VALUES (${OWNER}, ${coffee}, 'espresso', ${device}, gen_random_uuid())`
    expect(await attempt(() => mark(gear.coffee, gear.device))).toBeNull()
    expect(
      refused(await attempt(() => mark(gear.theirCoffee, gear.device))),
    ).toBe(true)
    expect(
      refused(await attempt(() => mark(gear.coffee, gear.theirDevice))),
    ).toBe(true)
  })
})

describe('owners are fixed', () => {
  it.each([...LOOKUPS, 'coffees', 'green_coffees'] as const)(
    '%s refuses changing user_id',
    async (table) => {
      const id =
        table === 'coffees'
          ? gear.coffee
          : table === 'green_coffees'
            ? gear.greenCoffee
            : own[table]
      const err = await attempt(
        () =>
          sql`UPDATE ${sql.identifier(table)} SET user_id = ${OTHER} WHERE id = ${id}`,
      )
      expect(err).not.toBeNull()
    },
  )
})
