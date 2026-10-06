import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../db'
import { countries, farms, regions } from '../db/schema'
import { lookupNameClashMessage } from '../lib/lookup-name'
import { isPgUniqueViolation } from '../lib/pg-error'
import { lookupTables } from '../../test/lookups'
import { seedUsers, uniqFor } from '../../test/trpc'
import type { Lookup } from '../../test/lookups'

const ALICE = 'lookup-names-alice'
const BOB = 'lookup-names-bob'
const uniq = uniqFor(ALICE)

async function deleteTestLookups() {
  for (const sqlName of [
    'farms',
    'regions',
    'countries',
    'roast_levels',
    'roasters',
    'varieties',
    'coffee_processes',
    'brewing_device_types',
    'aeropress_methods',
    'pourover_methods',
    'frenchpress_methods',
  ]) {
    await db.execute(
      sql`DELETE FROM ${sql.identifier(sqlName)} WHERE name LIKE ${'%' + ALICE + '%'}`,
    )
  }
}

beforeAll(deleteTestLookups)
seedUsers([ALICE, BOB])
afterAll(deleteTestLookups)

const sharedSentence = (name: string) =>
  `${name} is already in the list. Pick it there, or give yours a different name.`
const ownSentence = (name: string) =>
  `You already have one called ${name}. Pick it there, or give this one a different name.`

async function expectClash(run: () => Promise<unknown>, sentence: string) {
  try {
    await run()
    expect.unreachable('expected a lookup name clash')
  } catch (error) {
    expect(lookupNameClashMessage(error)).toBe(sentence)
  }
}

function scopeField(lookup: Lookup) {
  if (lookup.scope?.column === 'country_id') return 'countryId'
  if (lookup.scope?.column === 'region_id') return 'regionId'
  return null
}

async function parentIdFor(lookup: Lookup) {
  if (lookup.sqlName === 'regions') {
    const [country] = await db
      .insert(countries)
      .values({ name: uniq('Country'), userId: ALICE })
      .returning()
    return country.id
  }
  if (lookup.sqlName === 'farms') {
    const [country] = await db
      .insert(countries)
      .values({ name: uniq('Country'), userId: ALICE })
      .returning()
    const [region] = await db
      .insert(regions)
      .values({ name: uniq('Region'), userId: ALICE, countryId: country.id })
      .returning()
    return region.id
  }
  return null
}

function rowFor(
  lookup: Lookup,
  name: string,
  userId?: string | null,
  parentId?: string | null,
) {
  const row: Record<string, unknown> = { name }
  if (userId !== undefined) row.userId = userId
  const field = scopeField(lookup)
  if (field) row[field] = parentId ?? null
  return row
}

type LookupRow = { id: string; name: string; userId: string | null }

function insert(lookup: Lookup, row: Record<string, unknown>) {
  return db.insert(lookup.table).values(row as never).returning() as Promise<
    Array<LookupRow>
  >
}

describe.each(lookupTables())('$sqlName names', (lookup) => {
  it('refuses a second shared default of the same name, ignoring case', async () => {
    const parentId = await parentIdFor(lookup)
    const saved = uniq('Shared')
    await insert(lookup, rowFor(lookup, saved, null, parentId))
    await expect(
      insert(lookup, rowFor(lookup, saved.toLowerCase(), null, parentId)),
    ).rejects.toSatisfy(isPgUniqueViolation)
  })

  it('lets ON CONFLICT DO NOTHING absorb a shared re-insert', async () => {
    const parentId = await parentIdFor(lookup)
    const saved = uniq('Seeded')
    await insert(lookup, rowFor(lookup, saved, null, parentId))
    const ignored = await db
      .insert(lookup.table)
      .values(rowFor(lookup, saved.toLowerCase(), null, parentId) as never)
      .onConflictDoNothing()
      .returning()
    expect(ignored).toEqual([])
  })

  it('refuses a user entry that takes a shared default name', async () => {
    const parentId = await parentIdFor(lookup)
    const saved = uniq('Onyx Test')
    await insert(lookup, rowFor(lookup, saved, null, parentId))
    await expectClash(
      () => insert(lookup, rowFor(lookup, saved.toLowerCase(), ALICE, parentId)),
      sharedSentence(saved),
    )
  })

  it('refuses a user entry that duplicates their own, ignoring case', async () => {
    const parentId = await parentIdFor(lookup)
    const saved = uniq('Kaffa Lab')
    await insert(lookup, rowFor(lookup, saved, ALICE, parentId))
    await expectClash(
      () => insert(lookup, rowFor(lookup, saved.toLowerCase(), ALICE, parentId)),
      ownSentence(saved),
    )
  })

  it('lets two users share a name', async () => {
    const parentId = await parentIdFor(lookup)
    const saved = uniq('Shared-by-users')
    await insert(lookup, rowFor(lookup, saved, ALICE, parentId))
    const [bobs] = await insert(
      lookup,
      rowFor(lookup, saved.toLowerCase(), BOB, parentId),
    )
    expect(bobs.name).toBe(saved.toLowerCase())
    expect(bobs.userId).toBe(BOB)
  })

  it('refuses a rename into a clash and names the saved casing', async () => {
    const parentId = await parentIdFor(lookup)
    const saved = uniq('Kept')
    await insert(lookup, rowFor(lookup, saved, null, parentId))
    const [mine] = await insert(
      lookup,
      rowFor(lookup, uniq('Mine'), ALICE, parentId),
    )
    await expectClash(
      () =>
        db
          .update(lookup.table)
          .set({ name: saved.toLowerCase() } as never)
          .where(eq(lookup.id, mine.id)),
      sharedSentence(saved),
    )
  })

  it('lets a shared default take a name a user already has', async () => {
    const parentId = await parentIdFor(lookup)
    const saved = uniq('UserFirst')
    await insert(lookup, rowFor(lookup, saved, ALICE, parentId))
    const [shared] = await insert(
      lookup,
      rowFor(lookup, saved.toLowerCase(), null, parentId),
    )
    expect(shared.userId).toBeNull()
  })
})

describe('region parent scope', () => {
  it('allows the same name in two countries and collides inside one, including a missing parent', async () => {
    const [colombia] = await db
      .insert(countries)
      .values({ name: uniq('Colombia'), userId: ALICE })
      .returning()
    const [peru] = await db
      .insert(countries)
      .values({ name: uniq('Peru'), userId: ALICE })
      .returning()
    const saved = uniq('Huila')
    await db.insert(regions).values({
      name: saved,
      userId: ALICE,
      countryId: colombia.id,
    })
    await db.insert(regions).values({
      name: saved,
      userId: ALICE,
      countryId: peru.id,
    })
    await expectClash(
      () =>
        db.insert(regions).values({
          name: saved.toLowerCase(),
          userId: ALICE,
          countryId: colombia.id,
        }),
      ownSentence(saved),
    )

    const orphan = uniq('Orphan')
    await db
      .insert(regions)
      .values({ name: orphan, userId: ALICE, countryId: null })
    await expectClash(
      () =>
        db.insert(regions).values({
          name: orphan.toLowerCase(),
          userId: ALICE,
          countryId: null,
        }),
      ownSentence(orphan),
    )

    const [move] = await db
      .insert(regions)
      .values({
        name: saved,
        userId: ALICE,
        countryId: null,
      })
      .returning()
    await expectClash(
      () =>
        db
          .update(regions)
          .set({ countryId: colombia.id })
          .where(eq(regions.id, move.id)),
      ownSentence(saved),
    )
  })
})

describe('farm parent scope', () => {
  it('allows the same name in two regions and collides inside one, including a missing parent', async () => {
    const [country] = await db
      .insert(countries)
      .values({ name: uniq('Kenya'), userId: ALICE })
      .returning()
    const [nyeri] = await db
      .insert(regions)
      .values({ name: uniq('Nyeri'), userId: ALICE, countryId: country.id })
      .returning()
    const [kirinyaga] = await db
      .insert(regions)
      .values({
        name: uniq('Kirinyaga'),
        userId: ALICE,
        countryId: country.id,
      })
      .returning()
    const saved = uniq('Karogoto')
    await db.insert(farms).values({
      name: saved,
      userId: ALICE,
      regionId: nyeri.id,
    })
    await db.insert(farms).values({
      name: saved,
      userId: ALICE,
      regionId: kirinyaga.id,
    })
    await expectClash(
      () =>
        db.insert(farms).values({
          name: saved.toLowerCase(),
          userId: ALICE,
          regionId: nyeri.id,
        }),
      ownSentence(saved),
    )

    const orphan = uniq('OrphanFarm')
    await db
      .insert(farms)
      .values({ name: orphan, userId: ALICE, regionId: null })
    await expectClash(
      () =>
        db.insert(farms).values({
          name: orphan.toLowerCase(),
          userId: ALICE,
          regionId: null,
        }),
      ownSentence(orphan),
    )

    const [move] = await db
      .insert(farms)
      .values({
        name: saved,
        userId: ALICE,
        regionId: null,
      })
      .returning()
    await expectClash(
      () =>
        db
          .update(farms)
          .set({ regionId: nyeri.id })
          .where(eq(farms.id, move.id)),
      ownSentence(saved),
    )
  })
})
