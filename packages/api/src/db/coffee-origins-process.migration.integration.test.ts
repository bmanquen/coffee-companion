import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import type { PoolClient } from 'pg'

const MIGRATION_SQL = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    '../../drizzle/20260921201457_dazzling_thunderball/migration.sql',
  ),
  'utf8',
)

const statements = MIGRATION_SQL.split('--> statement-breakpoint').map(
  (statement) => statement.trim(),
)
const backfillProcess = statements.find((statement) =>
  statement.includes('SET "process_id" = c."process_id"'),
)
const dropBagProcess = statements.find((statement) =>
  statement.includes('DROP COLUMN "process_id"'),
)

if (!backfillProcess || !dropBagProcess) {
  throw new Error(
    'expected the process-per-origin migration to backfill coffee_origins and drop coffees.process_id',
  )
}

const COFFEE_WASHED = '55555555-5555-4555-8555-555555555555'
const COFFEE_NONE = '66666666-6666-4666-8666-666666666666'
const COFFEE_ORPHAN_PROCESS = '77777777-7777-4777-8777-777777777777'
const COUNTRY_ETHIOPIA = '11111111-1111-4111-8111-111111111111'
const COUNTRY_COLOMBIA = '22222222-2222-4222-8222-222222222222'
const PROCESS_WASHED = '33333333-3333-4333-8333-333333333333'
const PROCESS_NATURAL = '44444444-4444-4444-8444-444444444444'

let pool: Pool

beforeAll(() => {
  pool = new Pool()
})

afterAll(async () => {
  await pool.end()
})

async function withProcessTables(
  run: (client: PoolClient) => Promise<void>,
) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`
      CREATE TEMP TABLE coffees (
        id uuid PRIMARY KEY,
        process_id uuid
      ) ON COMMIT DROP
    `)
    await client.query(`
      CREATE TEMP TABLE coffee_origins (
        coffee_id uuid NOT NULL,
        country_id uuid NOT NULL,
        process_id uuid,
        PRIMARY KEY (coffee_id, country_id)
      ) ON COMMIT DROP
    `)
    await run(client)
  } finally {
    await client.query('ROLLBACK')
    client.release()
  }
}

describe('coffee origins process backfill', () => {
  it('copies a bag-level process onto every origin row of that coffee', async () => {
    await withProcessTables(async (client) => {
      await client.query(
        `INSERT INTO coffees (id, process_id) VALUES ($1, $2), ($3, NULL)`,
        [COFFEE_WASHED, PROCESS_WASHED, COFFEE_NONE],
      )
      await client.query(
        `INSERT INTO coffee_origins (coffee_id, country_id, process_id) VALUES
          ($1, $2, NULL),
          ($1, $3, NULL),
          ($4, $2, NULL)`,
        [COFFEE_WASHED, COUNTRY_ETHIOPIA, COUNTRY_COLOMBIA, COFFEE_NONE],
      )

      await client.query(backfillProcess)

      const { rows } = await client.query<{
        coffee_id: string
        country_id: string
        process_id: string | null
      }>(
        `SELECT coffee_id, country_id, process_id
         FROM coffee_origins
         ORDER BY coffee_id, country_id`,
      )

      expect(rows).toEqual([
        {
          coffee_id: COFFEE_WASHED,
          country_id: COUNTRY_ETHIOPIA,
          process_id: PROCESS_WASHED,
        },
        {
          coffee_id: COFFEE_WASHED,
          country_id: COUNTRY_COLOMBIA,
          process_id: PROCESS_WASHED,
        },
        {
          coffee_id: COFFEE_NONE,
          country_id: COUNTRY_ETHIOPIA,
          process_id: null,
        },
      ])
    })
  })

  it('drops a bag-level process that has no origin row to land on', async () => {
    await withProcessTables(async (client) => {
      await client.query(
        `INSERT INTO coffees (id, process_id) VALUES ($1, $2)`,
        [COFFEE_ORPHAN_PROCESS, PROCESS_NATURAL],
      )

      await client.query(backfillProcess)
      await client.query('ALTER TABLE coffees DROP COLUMN process_id')

      const { rows } = await client.query<{ coffee_id: string }>(
        'SELECT coffee_id FROM coffee_origins',
      )
      expect(rows).toEqual([])

      const columns = await client.query<{ column_name: string }>(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_name = 'coffees' AND table_schema LIKE 'pg_temp%'`,
      )
      expect(columns.rows.map((row) => row.column_name)).not.toContain(
        'process_id',
      )
    })
  })
})
