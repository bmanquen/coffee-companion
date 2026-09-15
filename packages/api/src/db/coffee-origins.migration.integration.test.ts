import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import type { PoolClient } from 'pg'

const MIGRATION_SQL = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    '../../drizzle/20260915162143_classy_mac_gargan/migration.sql',
  ),
  'utf8',
)

const statements = MIGRATION_SQL.split('--> statement-breakpoint').map(
  (statement) => statement.trim(),
)
const backfillOrigins = statements.find((statement) =>
  statement.includes('INSERT INTO "coffee_origins"'),
)
const refuseUnrecoverable = statements.find((statement) =>
  statement.includes('refuse_unrecoverable_origins'),
)

if (!backfillOrigins || !refuseUnrecoverable) {
  throw new Error(
    'expected the origins migration to backfill coffee_origins and refuse unrecoverable rows',
  )
}

const COUNTRY_ETHIOPIA = '11111111-1111-4111-8111-111111111111'
const COUNTRY_COLOMBIA = '22222222-2222-4222-8222-222222222222'
const REGION_GUJI = '33333333-3333-4333-8333-333333333333'
const REGION_HUILA = '44444444-4444-4444-8444-444444444444'
const REGION_NO_COUNTRY = '88888888-8888-4888-8888-888888888888'
const COFFEE_WITH_COUNTRY = '55555555-5555-4555-8555-555555555555'
const COFFEE_REGION_ONLY = '66666666-6666-4666-8666-666666666666'
const COFFEE_NONE = '77777777-7777-4777-8777-777777777777'
const COFFEE_MISMATCHED = '99999999-9999-4999-8999-999999999999'
const COFFEE_REGION_NO_COUNTRY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

let pool: Pool

beforeAll(() => {
  pool = new Pool()
})

afterAll(async () => {
  await pool.end()
})

async function withOriginTables(
  run: (client: PoolClient) => Promise<void>,
) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`
      CREATE TEMP TABLE regions (
        id uuid PRIMARY KEY,
        country_id uuid
      ) ON COMMIT DROP
    `)
    await client.query(`
      CREATE TEMP TABLE coffees (
        id uuid PRIMARY KEY,
        country_id uuid,
        region_id uuid
      ) ON COMMIT DROP
    `)
    await client.query(`
      CREATE TEMP TABLE coffee_origins (
        coffee_id uuid NOT NULL,
        country_id uuid NOT NULL,
        region_id uuid,
        PRIMARY KEY (coffee_id, country_id)
      ) ON COMMIT DROP
    `)
    await run(client)
  } finally {
    await client.query('ROLLBACK')
    client.release()
  }
}

describe('coffee origins backfill', () => {
  it('copies matching origins and recovers a region-only coffee via its region country', async () => {
    await withOriginTables(async (client) => {
      await client.query(
        `INSERT INTO regions (id, country_id) VALUES ($1, $2), ($3, $4)`,
        [REGION_GUJI, COUNTRY_ETHIOPIA, REGION_HUILA, COUNTRY_COLOMBIA],
      )
      await client.query(
        `INSERT INTO coffees (id, country_id, region_id) VALUES
          ($1, $2, $3),
          ($4, NULL, $5),
          ($6, NULL, NULL)`,
        [
          COFFEE_WITH_COUNTRY,
          COUNTRY_ETHIOPIA,
          REGION_GUJI,
          COFFEE_REGION_ONLY,
          REGION_HUILA,
          COFFEE_NONE,
        ],
      )

      await client.query(backfillOrigins)
      await client.query(refuseUnrecoverable)

      const { rows } = await client.query<{
        coffee_id: string
        country_id: string
        region_id: string | null
      }>(
        'SELECT coffee_id, country_id, region_id FROM coffee_origins ORDER BY coffee_id',
      )

      expect(rows).toEqual([
        {
          coffee_id: COFFEE_WITH_COUNTRY,
          country_id: COUNTRY_ETHIOPIA,
          region_id: REGION_GUJI,
        },
        {
          coffee_id: COFFEE_REGION_ONLY,
          country_id: COUNTRY_COLOMBIA,
          region_id: REGION_HUILA,
        },
      ])
    })
  })

  it('keeps a coffee country and drops a region that belongs to a different country', async () => {
    await withOriginTables(async (client) => {
      await client.query(
        `INSERT INTO regions (id, country_id) VALUES ($1, $2)`,
        [REGION_HUILA, COUNTRY_COLOMBIA],
      )
      await client.query(
        `INSERT INTO coffees (id, country_id, region_id) VALUES ($1, $2, $3)`,
        [COFFEE_MISMATCHED, COUNTRY_ETHIOPIA, REGION_HUILA],
      )

      await client.query(backfillOrigins)
      await client.query(refuseUnrecoverable)

      const { rows } = await client.query<{
        coffee_id: string
        country_id: string
        region_id: string | null
      }>('SELECT coffee_id, country_id, region_id FROM coffee_origins')

      expect(rows).toEqual([
        {
          coffee_id: COFFEE_MISMATCHED,
          country_id: COUNTRY_ETHIOPIA,
          region_id: null,
        },
      ])
    })
  })

  it('refuses a region-only coffee whose region has no country', async () => {
    await withOriginTables(async (client) => {
      await client.query(`INSERT INTO regions (id, country_id) VALUES ($1, NULL)`, [
        REGION_NO_COUNTRY,
      ])
      await client.query(
        `INSERT INTO coffees (id, country_id, region_id) VALUES ($1, NULL, $2)`,
        [COFFEE_REGION_NO_COUNTRY, REGION_NO_COUNTRY],
      )

      await client.query(backfillOrigins)
      await expect(client.query(refuseUnrecoverable)).rejects.toThrow(
        /region has no country/i,
      )
    })
  })
})
