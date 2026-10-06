import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { Pool } from 'pg'
import { db } from '../db'
import { roasters } from '../db/schema'
import {
  lookupSqlNames,
  lookupUniqueConstraintNames,
} from '../../test/lookups'
import { seedUsers, uniqFor } from '../../test/trpc'
import type { PoolClient } from 'pg'

const ALICE = 'lookup-fold-alice'
const uniq = uniqFor(ALICE)

seedUsers([ALICE])

let pool: Pool

beforeAll(() => {
  pool = new Pool()
})

afterAll(async () => {
  await pool.end()
})

const LOOKUPS = lookupSqlNames()
const CONSTRAINTS = lookupUniqueConstraintNames()

async function withSandbox(run: (client: PoolClient) => Promise<void>) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const name of CONSTRAINTS) {
      const table = name.slice(0, name.indexOf('_user_id_name_key'))
      await client.query(
        `ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${name}`,
      )
    }
    for (const table of LOOKUPS) {
      await client.query(
        `ALTER TABLE ${table} DISABLE TRIGGER ${table}_name_guard`,
      )
    }
    await run(client)
    await client.query('ROLLBACK')
  } finally {
    await client.query('ROLLBACK').catch(() => {})
    client.release()
  }
}

describe('lookup_fold', () => {
  it('keeps the shared row when a user copy matches it', async () => {
    await withSandbox(async (client) => {
      const shared = await client.query<{ id: string }>(
        `INSERT INTO roasters (name) VALUES ('Onyx') RETURNING id`,
      )
      const copy = await client.query<{ id: string }>(
        `INSERT INTO roasters (name, user_id) VALUES ('onyx', $1) RETURNING id`,
        [ALICE],
      )
      const folded = await client.query(
        `SELECT loser::text, keeper::text FROM lookup_fold()`,
      )
      expect(folded.rows).toEqual([
        { loser: copy.rows[0].id, keeper: shared.rows[0].id },
      ])
      const left = await client.query(
        `SELECT id FROM roasters WHERE id = ANY($1::uuid[])`,
        [[shared.rows[0].id, copy.rows[0].id]],
      )
      expect(left.rows.map((r) => r.id)).toEqual([shared.rows[0].id])
    })
  })

  it('keeps the oldest row when there is no shared default', async () => {
    await withSandbox(async (client) => {
      const older = await client.query<{ id: string }>(
        `INSERT INTO roasters (id, name, user_id, created_at)
         VALUES ('11111111-1111-4111-8111-111111111111', 'Heart', $1, '2026-01-01')
         RETURNING id`,
        [ALICE],
      )
      const newer = await client.query<{ id: string }>(
        `INSERT INTO roasters (id, name, user_id, created_at)
         VALUES ('22222222-2222-4222-8222-222222222222', 'heart', $1, '2026-01-02')
         RETURNING id`,
        [ALICE],
      )
      const folded = await client.query(
        `SELECT loser::text, keeper::text FROM lookup_fold()`,
      )
      expect(folded.rows).toEqual([
        { loser: newer.rows[0].id, keeper: older.rows[0].id },
      ])
    })
  })

  it('dedupes an identical variety link and aborts disagreeing origins', async () => {
    await withSandbox(async (client) => {
      const [roaster] = (
        await client.query<{ id: string }>(
          `INSERT INTO roasters (name, user_id) VALUES ($1, $2) RETURNING id`,
          [uniq('Roaster'), ALICE],
        )
      ).rows
      const [roast] = (
        await client.query<{ id: string }>(
          `INSERT INTO roast_levels (name, user_id) VALUES ($1, $2) RETURNING id`,
          [uniq('Medium'), ALICE],
        )
      ).rows
      const [coffee] = (
        await client.query<{ id: string }>(
          `INSERT INTO coffees (name, user_id, roaster_id, roast_level_id)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [uniq('Geisha'), ALICE, roaster.id, roast.id],
        )
      ).rows
      const [keptVariety] = (
        await client.query<{ id: string }>(
          `INSERT INTO varieties (name) VALUES ('Typica') RETURNING id`,
        )
      ).rows
      const [lostVariety] = (
        await client.query<{ id: string }>(
          `INSERT INTO varieties (name, user_id) VALUES ('typica', $1) RETURNING id`,
          [ALICE],
        )
      ).rows
      await client.query(
        `INSERT INTO coffees_varieties (coffee_id, variety_id) VALUES ($1, $2), ($1, $3)`,
        [coffee.id, keptVariety.id, lostVariety.id],
      )
      const [green] = (
        await client.query<{ id: string }>(
          `INSERT INTO green_coffees (name, user_id) VALUES ($1, $2) RETURNING id`,
          [uniq('Green'), ALICE],
        )
      ).rows
      await client.query(
        `INSERT INTO green_coffees_varieties (green_coffee_id, variety_id)
         VALUES ($1, $2), ($1, $3)`,
        [green.id, keptVariety.id, lostVariety.id],
      )
      await client.query(`SELECT * FROM lookup_fold()`)
      const links = await client.query(
        `SELECT variety_id FROM coffees_varieties WHERE coffee_id = $1`,
        [coffee.id],
      )
      expect(links.rows).toEqual([{ variety_id: keptVariety.id }])
      const greenLinks = await client.query(
        `SELECT variety_id FROM green_coffees_varieties WHERE green_coffee_id = $1`,
        [green.id],
      )
      expect(greenLinks.rows).toEqual([{ variety_id: keptVariety.id }])

      for (const table of LOOKUPS) {
        await client.query(
          `ALTER TABLE ${table} DISABLE TRIGGER ${table}_name_guard`,
        )
      }

      const [ethiopia] = (
        await client.query<{ id: string }>(
          `INSERT INTO countries (name) VALUES ('Ethiopia') RETURNING id`,
        )
      ).rows
      const [ethiopiaCopy] = (
        await client.query<{ id: string }>(
          `INSERT INTO countries (name, user_id) VALUES ('ethiopia', $1) RETURNING id`,
          [ALICE],
        )
      ).rows
      const [guji] = (
        await client.query<{ id: string }>(
          `INSERT INTO regions (name, country_id) VALUES ('Guji', $1) RETURNING id`,
          [ethiopia.id],
        )
      ).rows
      const [yirgacheffe] = (
        await client.query<{ id: string }>(
          `INSERT INTO regions (name, country_id) VALUES ('Yirgacheffe', $1) RETURNING id`,
          [ethiopiaCopy.id],
        )
      ).rows
      await client.query(
        `INSERT INTO coffee_origins (coffee_id, country_id, region_id)
         VALUES ($1, $2, $3), ($1, $4, $5)`,
        [coffee.id, ethiopia.id, guji.id, ethiopiaCopy.id, yirgacheffe.id],
      )
      await expect(client.query(`SELECT * FROM lookup_fold()`)).rejects.toThrow(
        /disagreeing rows/,
      )
    })
  })

  it('dedupes identical origins and repoints a SET NULL process instead of clearing it', async () => {
    await withSandbox(async (client) => {
      const [roaster] = (
        await client.query<{ id: string }>(
          `INSERT INTO roasters (name, user_id) VALUES ($1, $2) RETURNING id`,
          [uniq('Roaster'), ALICE],
        )
      ).rows
      const [roast] = (
        await client.query<{ id: string }>(
          `INSERT INTO roast_levels (name, user_id) VALUES ($1, $2) RETURNING id`,
          [uniq('Medium'), ALICE],
        )
      ).rows
      const [coffee] = (
        await client.query<{ id: string }>(
          `INSERT INTO coffees (name, user_id, roaster_id, roast_level_id)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [uniq('Geisha'), ALICE, roaster.id, roast.id],
        )
      ).rows
      const countryName = uniq('Kenya')
      const processName = uniq('Washed')
      const [keptCountry] = (
        await client.query<{ id: string }>(
          `INSERT INTO countries (name) VALUES ($1) RETURNING id`,
          [countryName],
        )
      ).rows
      const [lostCountry] = (
        await client.query<{ id: string }>(
          `INSERT INTO countries (name, user_id) VALUES ($1, $2) RETURNING id`,
          [countryName.toLowerCase(), ALICE],
        )
      ).rows
      const [keptProcess] = (
        await client.query<{ id: string }>(
          `INSERT INTO coffee_processes (name) VALUES ($1) RETURNING id`,
          [processName],
        )
      ).rows
      const [lostProcess] = (
        await client.query<{ id: string }>(
          `INSERT INTO coffee_processes (name, user_id) VALUES ($1, $2) RETURNING id`,
          [processName.toLowerCase(), ALICE],
        )
      ).rows
      await client.query(
        `INSERT INTO coffee_origins (coffee_id, country_id, process_id)
         VALUES ($1, $2, $3), ($1, $4, $5)`,
        [
          coffee.id,
          keptCountry.id,
          keptProcess.id,
          lostCountry.id,
          lostProcess.id,
        ],
      )
      await client.query(`SELECT * FROM lookup_fold()`)
      const origins = await client.query(
        `SELECT country_id, process_id FROM coffee_origins WHERE coffee_id = $1`,
        [coffee.id],
      )
      expect(origins.rows).toEqual([
        { country_id: keptCountry.id, process_id: keptProcess.id },
      ])
    })
  })

  it('moves a region with its country and then folds the matching name', async () => {
    await withSandbox(async (client) => {
      const [sharedCountry] = (
        await client.query<{ id: string }>(
          `INSERT INTO countries (name) VALUES ('Colombia') RETURNING id`,
        )
      ).rows
      const [userCountry] = (
        await client.query<{ id: string }>(
          `INSERT INTO countries (name, user_id) VALUES ('colombia', $1) RETURNING id`,
          [ALICE],
        )
      ).rows
      const [sharedRegion] = (
        await client.query<{ id: string }>(
          `INSERT INTO regions (name, country_id) VALUES ('Huila', $1) RETURNING id`,
          [sharedCountry.id],
        )
      ).rows
      const [userRegion] = (
        await client.query<{ id: string }>(
          `INSERT INTO regions (name, user_id, country_id) VALUES ('huila', $1, $2) RETURNING id`,
          [ALICE, userCountry.id],
        )
      ).rows
      await client.query(`SELECT * FROM lookup_fold()`)
      const regionsLeft = await client.query(
        `SELECT id, country_id FROM regions WHERE id = ANY($1::uuid[])`,
        [[sharedRegion.id, userRegion.id]],
      )
      expect(regionsLeft.rows).toEqual([
        { id: sharedRegion.id, country_id: sharedCountry.id },
      ])
      const countriesLeft = await client.query(
        `SELECT id FROM countries WHERE id = ANY($1::uuid[])`,
        [[sharedCountry.id, userCountry.id]],
      )
      expect(countriesLeft.rows.map((r) => r.id)).toEqual([sharedCountry.id])
    })
  })

  it('aborts rather than merging two coffees onto one roaster and name', async () => {
    await withSandbox(async (client) => {
      const [shared] = (
        await client.query<{ id: string }>(
          `INSERT INTO roasters (name) VALUES ('Onyx') RETURNING id`,
        )
      ).rows
      const [copy] = (
        await client.query<{ id: string }>(
          `INSERT INTO roasters (name, user_id) VALUES ('onyx', $1) RETURNING id`,
          [ALICE],
        )
      ).rows
      const [roast] = (
        await client.query<{ id: string }>(
          `INSERT INTO roast_levels (name, user_id) VALUES ($1, $2) RETURNING id`,
          [uniq('Medium'), ALICE],
        )
      ).rows
      await client.query(
        `INSERT INTO coffees (name, user_id, roaster_id, roast_level_id)
         VALUES ('Geisha', $1, $2, $3), ('Geisha', $1, $4, $3)`,
        [ALICE, shared.id, roast.id, copy.id],
      )
      await expect(client.query(`SELECT * FROM lookup_fold()`)).rejects.toThrow(
        /unique|duplicate/i,
      )
    })
  })

  it('returns nothing on a second run', async () => {
    const again = await pool.query(`SELECT * FROM lookup_fold()`)
    expect(again.rows).toEqual([])
  })
})

describe('a later shared default', () => {
  it('inserts over a user copy, then folds that copy into the shared row', async () => {
    const name = uniq('LaterDefault')
    const [copy] = await db
      .insert(roasters)
      .values({ name, userId: ALICE })
      .returning()
    const [shared] = await db.insert(roasters).values({ name }).returning()
    const folded = await pool.query<{ loser: string; keeper: string }>(
      `SELECT loser::text, keeper::text FROM lookup_fold()`,
    )
    expect(folded.rows).toContainEqual({ loser: copy.id, keeper: shared.id })
    const left = await db
      .select({ id: roasters.id })
      .from(roasters)
      .where(sql`${roasters.id} in (${copy.id}, ${shared.id})`)
    expect(left.map((r) => r.id)).toEqual([shared.id])
  })
})
