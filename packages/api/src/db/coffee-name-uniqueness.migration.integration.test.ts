import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Pool } from 'pg'

const MIGRATION_SQL = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    '../../drizzle/20260914170135_curly_goliath/migration.sql',
  ),
  'utf8',
)

const [renameDuplicates, createUniqueIndex] = MIGRATION_SQL.split(
  '--> statement-breakpoint',
).map((statement) => statement.trim())

if (!renameDuplicates || !createUniqueIndex) {
  throw new Error(
    'expected the uniqueness migration to rename duplicates, then create the index',
  )
}

const USER = 'mig-uniq-user'
const ROASTER = '11111111-1111-4111-8111-111111111111'
const KEEPER_ID = '22222222-2222-4222-8222-222222222222'
const DUPE_ID = '33333333-3333-4333-8333-333333333333'
const TAKEN_ID = '44444444-4444-4444-8444-444444444444'

let pool: Pool

beforeAll(() => {
  pool = new Pool()
})

afterAll(async () => {
  await pool.end()
})

type CoffeeSeed = {
  id: string
  name: string
  createdAt: string
}

async function migrateLegacyCoffees(seeds: Array<CoffeeSeed>) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // The migration names "coffees" without a schema. A temp table of that
    // name shadows public.coffees on this connection, so the SQL under test
    // never touches the suite's data.
    await client.query(`
      CREATE TEMP TABLE coffees (
        id uuid PRIMARY KEY,
        user_id text NOT NULL,
        roaster_id uuid,
        name text NOT NULL,
        created_at timestamp NOT NULL
      ) ON COMMIT DROP
    `)
    for (const seed of seeds) {
      await client.query(
        `INSERT INTO coffees (id, user_id, roaster_id, name, created_at)
         VALUES ($1, $2, $3, $4, $5::timestamp)`,
        [seed.id, USER, ROASTER, seed.name, seed.createdAt],
      )
    }
    await client.query(renameDuplicates)
    await client.query(createUniqueIndex)
    const { rows } = await client.query<{ id: string; name: string }>(
      'SELECT id, name FROM coffees',
    )
    return Object.fromEntries(rows.map((row) => [row.id, row.name]))
  } finally {
    await client.query('ROLLBACK')
    client.release()
  }
}

describe('coffee name uniqueness migration', () => {
  it('keeps the oldest name and suffixes later duplicates with their id', async () => {
    const names = await migrateLegacyCoffees([
      {
        id: KEEPER_ID,
        name: 'House Blend',
        createdAt: '2026-01-01 00:00:00',
      },
      {
        id: DUPE_ID,
        name: 'House Blend',
        createdAt: '2026-01-02 00:00:00',
      },
    ])

    expect(names[KEEPER_ID]).toBe('House Blend')
    expect(names[DUPE_ID]).toBe(`House Blend (${DUPE_ID})`)
  })

  it('finds a free name when name (id) is already taken', async () => {
    const takenName = `House Blend (${DUPE_ID})`
    const names = await migrateLegacyCoffees([
      {
        id: KEEPER_ID,
        name: 'House Blend',
        createdAt: '2026-01-01 00:00:00',
      },
      {
        id: TAKEN_ID,
        name: takenName,
        createdAt: '2026-01-02 00:00:00',
      },
      {
        id: DUPE_ID,
        name: 'House Blend',
        createdAt: '2026-01-03 00:00:00',
      },
    ])

    expect(names[KEEPER_ID]).toBe('House Blend')
    expect(names[TAKEN_ID]).toBe(takenName)
    expect(names[DUPE_ID]).not.toBe('House Blend')
    expect(names[DUPE_ID]).not.toBe(takenName)
    expect(new Set(Object.values(names)).size).toBe(3)
  })
})
