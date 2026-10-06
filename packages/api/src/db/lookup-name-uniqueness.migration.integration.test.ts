import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import {
  lookupSqlNames,
  lookupUniqueConstraintNames,
} from '../../test/lookups'

const FOLDER = '20261006181737_lookup_name_uniqueness'
const MIGRATION_SQL = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), `../../drizzle/${FOLDER}/migration.sql`),
  'utf8',
)

const statements: Array<string> = MIGRATION_SQL.split(
  '--> statement-breakpoint',
).map((statement) => statement.trim())

function lastIndex(
  items: Array<string>,
  matches: (item: string) => boolean,
) {
  for (let i = items.length - 1; i >= 0; i--) {
    if (matches(items[i])) return i
  }
  return -1
}

let pool: Pool

beforeAll(() => {
  pool = new Pool()
})

afterAll(async () => {
  await pool.end()
})

describe('lookup name uniqueness migration SQL', () => {
  it('drops the old indexes, then adds name_key, then the guard, then folds, then unique constraints', () => {
    const firstDrop = statements.findIndex((item) => item.startsWith('DROP INDEX'))
    const lastDrop = lastIndex(statements, (item) => item.startsWith('DROP INDEX'))
    const firstAdd = statements.findIndex((item) =>
      item.includes('ADD COLUMN "name_key"'),
    )
    const lastNotNull = lastIndex(statements, (item) =>
      item.includes('ALTER COLUMN "name_key" SET NOT NULL'),
    )
    const guardFn = statements.findIndex((item) =>
      item.includes('CREATE FUNCTION lookup_name_guard()'),
    )
    const lastTrigger = lastIndex(statements, (item) =>
      item.startsWith('CREATE TRIGGER'),
    )
    const foldPlan = statements.findIndex((item) =>
      item.includes('CREATE FUNCTION lookup_fold_plan()'),
    )
    const foldFn = statements.findIndex((item) =>
      item.includes('CREATE FUNCTION lookup_fold()'),
    )
    const rename = statements.findIndex((item) =>
      item.includes('roaster_id IS NOT NULL'),
    )
    const foldCall = statements.findIndex((item) =>
      item.includes('SELECT * FROM lookup_fold()'),
    )
    const firstUnique = statements.findIndex((item) =>
      item.includes('UNIQUE NULLS NOT DISTINCT'),
    )
    const lastUnique = lastIndex(statements, (item) =>
      item.includes('UNIQUE NULLS NOT DISTINCT'),
    )

    expect(firstDrop).toBe(0)
    expect(lastDrop).toBeLessThan(firstAdd)
    expect(firstAdd).toBeLessThan(lastNotNull)
    expect(lastNotNull).toBeLessThan(guardFn)
    expect(guardFn).toBeLessThan(lastTrigger)
    expect(lastTrigger).toBeLessThan(foldPlan)
    expect(foldPlan).toBeLessThan(foldFn)
    expect(foldFn).toBeLessThan(rename)
    expect(rename).toBeLessThan(foldCall)
    expect(foldCall).toBeLessThan(firstUnique)
    expect(lastUnique).toBe(statements.length - 1)
  })

  it('disables the name-guard triggers inside lookup_fold, then re-enables them', () => {
    const fold = statements.find((s) =>
      s.includes('CREATE FUNCTION lookup_fold()'),
    )
    expect(fold).toContain('DISABLE TRIGGER')
    expect(fold).toContain('ENABLE TRIGGER')
  })
})

const LOOKUPS = lookupSqlNames()
const CONSTRAINTS = lookupUniqueConstraintNames()

const OLD_INDEXES = [
  `CREATE UNIQUE INDEX "aeropress_methods_name_idx" ON "aeropress_methods" ("name")`,
  `CREATE UNIQUE INDEX "brewing_device_types_name_idx" ON "brewing_device_types" ("name")`,
  `CREATE UNIQUE INDEX "coffee_processes_name_idx" ON "coffee_processes" ("name")`,
  `CREATE UNIQUE INDEX "countries_name_idx" ON "countries" ("name")`,
  `CREATE UNIQUE INDEX "farms_name_region_idx" ON "farms" ("name","region_id")`,
  `CREATE UNIQUE INDEX "frenchpress_methods_name_idx" ON "frenchpress_methods" ("name")`,
  `CREATE UNIQUE INDEX "pourover_methods_name_idx" ON "pourover_methods" ("name")`,
  `CREATE UNIQUE INDEX "regions_name_country_idx" ON "regions" ("name","country_id")`,
  `CREATE UNIQUE INDEX "roast_levels_name_idx" ON "roast_levels" ("name")`,
  `CREATE UNIQUE INDEX "roasters_name_idx" ON "roasters" ("name")`,
  `CREATE UNIQUE INDEX "varieties_name_idx" ON "varieties" ("name")`,
] as const

describe('lookup name uniqueness migration on legacy rows', () => {
  it('renames the later coffee then folds the user roaster into the shared one', async () => {
    const client = await pool.connect()
    const userId = 'mig-lookup-user'
    const sharedId = '11111111-1111-4111-8111-aaaaaaaaaaaa'
    const copyId = '22222222-2222-4222-8222-bbbbbbbbbbbb'
    const keeperCoffee = '33333333-3333-4333-8333-cccccccccccc'
    const dupeCoffee = '44444444-4444-4444-8444-dddddddddddd'
    const roastId = '55555555-5555-4555-8555-eeeeeeeeeeee'
    try {
      await client.query('BEGIN')
      for (const name of CONSTRAINTS) {
        const table = name.slice(0, name.indexOf('_user_id_name_key'))
        await client.query(
          `ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${name}`,
        )
      }
      await client.query('DROP FUNCTION IF EXISTS lookup_fold()')
      await client.query('DROP FUNCTION IF EXISTS lookup_fold_plan()')
      await client.query('DROP FUNCTION IF EXISTS lookup_name_guard() CASCADE')
      for (const table of LOOKUPS) {
        await client.query(
          `ALTER TABLE ${table} DROP COLUMN IF EXISTS name_key`,
        )
      }
      await client.query(
        `TRUNCATE ${LOOKUPS.join(', ')} RESTART IDENTITY CASCADE`,
      )
      for (const ddl of OLD_INDEXES) {
        await client.query(ddl)
      }
      await client.query(
        `INSERT INTO "user" (id, name, email)
         VALUES ($1, $1, $2)
         ON CONFLICT (id) DO NOTHING`,
        [userId, `${userId}@example.com`],
      )
      await client.query(
        `INSERT INTO roast_levels (id, name, user_id)
         VALUES ($1, 'Medium', $2)`,
        [roastId, userId],
      )
      await client.query(
        `INSERT INTO roasters (id, name, created_at)
         VALUES ($1, 'Onyx', '2026-01-01')`,
        [sharedId],
      )
      await client.query(
        `INSERT INTO roasters (id, name, user_id, created_at)
         VALUES ($1, 'onyx', $2, '2026-01-02')`,
        [copyId, userId],
      )
      await client.query(
        `INSERT INTO coffees (id, name, user_id, roaster_id, roast_level_id, created_at)
         VALUES ($1, 'Geisha', $2, $3, $4, '2026-01-01')`,
        [keeperCoffee, userId, sharedId, roastId],
      )
      await client.query(
        `INSERT INTO coffees (id, name, user_id, roaster_id, roast_level_id, created_at)
         VALUES ($1, 'Geisha', $2, $3, $4, '2026-01-02')`,
        [dupeCoffee, userId, copyId, roastId],
      )

      for (const statement of statements) {
        await client.query(statement)
      }

      const roasters = await client.query<{ id: string; name: string }>(
        `SELECT id, name FROM roasters WHERE id = ANY($1::uuid[])`,
        [[sharedId, copyId]],
      )
      expect(roasters.rows).toEqual([{ id: sharedId, name: 'Onyx' }])

      const coffees = await client.query<{ id: string; name: string; roaster_id: string }>(
        `SELECT id, name, roaster_id FROM coffees WHERE id = ANY($1::uuid[]) ORDER BY created_at`,
        [[keeperCoffee, dupeCoffee]],
      )
      expect(coffees.rows).toEqual([
        { id: keeperCoffee, name: 'Geisha', roaster_id: sharedId },
        {
          id: dupeCoffee,
          name: `Geisha (${dupeCoffee})`,
          roaster_id: sharedId,
        },
      ])
    } finally {
      await client.query('ROLLBACK')
      client.release()
    }
  })
})

describe('lookup shape', () => {
  it('gives every public id/name/nullable-user_id table a name_key and a guard trigger', async () => {
    const excluded: Array<string> = []
    const { rows } = await pool.query<{ table_name: string }>(`
      SELECT c.table_name
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.column_name IN ('id', 'name', 'user_id')
      GROUP BY c.table_name
      HAVING COUNT(*) FILTER (WHERE c.column_name = 'id') = 1
         AND COUNT(*) FILTER (WHERE c.column_name = 'name') = 1
         AND COUNT(*) FILTER (
           WHERE c.column_name = 'user_id' AND c.is_nullable = 'YES'
         ) = 1
    `)
    const tables = rows
      .map((r) => r.table_name)
      .filter((name) => !excluded.includes(name))
      .sort()
    expect(tables.length).toBeGreaterThan(0)

    for (const table of tables) {
      const cols = await pool.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'name_key'`,
        [table],
      )
      expect(cols.rowCount, `${table} has name_key`).toBe(1)
      const trig = await pool.query(
        `SELECT 1 FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_proc p ON p.oid = t.tgfoid
         WHERE c.relname = $1
           AND p.proname = 'lookup_name_guard'
           AND NOT t.tgisinternal`,
        [table],
      )
      expect(trig.rowCount, `${table} has lookup_name_guard`).toBe(1)
    }
  })
})
