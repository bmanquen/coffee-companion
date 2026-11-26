import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import type { PoolClient } from 'pg'

const FOLDER = '20261126211453_owned_references'
const statements = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    `../../drizzle/${FOLDER}/migration.sql`,
  ),
  'utf8',
)
  .split('--> statement-breakpoint')
  .map((statement) => statement.trim())

// The guard functions and the block that counts violations, then adds the
// triggers. The composite foreign keys come after it.
const guardStatements = statements.slice(
  0,
  statements.findIndex((statement) =>
    statement.startsWith('DO $owned_references$'),
  ) + 1,
)

const OWNER = 'owned-references-migration-owner'
const OTHER = 'owned-references-migration-other'

let pool: Pool

beforeAll(() => {
  pool = new Pool()
})

afterAll(async () => {
  await pool.end()
})

// Replays the guard part of the migration in a transaction that is rolled
// back, after `seed` writes rows as they could exist before it.
async function replayGuard(seed: (client: PoolClient) => Promise<void>) {
  const client = await pool.connect()
  const q = (text: string, values?: Array<unknown>) => client.query(text, values)
  try {
    await q('BEGIN')
    await q('DROP FUNCTION lookup_reference_guard() CASCADE')
    await q('DROP FUNCTION owner_lock() CASCADE')
    await q(
      `INSERT INTO "user" (id, name, email) VALUES ($1, $1, $1 || '@example.com'), ($2, $2, $2 || '@example.com')`,
      [OWNER, OTHER],
    )
    // The composite foreign keys are already in place, so skip them to write
    // a row from before this migration.
    await q('SET LOCAL session_replication_role = replica')
    await seed(client)
    await q('SET LOCAL session_replication_role = origin')
    for (const statement of guardStatements) await q(statement)
  } finally {
    await client.query('ROLLBACK')
    client.release()
  }
}

describe('owned references migration', () => {
  it('stops and names the rows that already reference another user’s data', async () => {
    await expect(
      replayGuard(async (client) => {
        const q = (text: string, values?: Array<unknown>) =>
          client.query<{ id: string }>(text, values)
        const theirs = await q(
          `INSERT INTO roasters (user_id, name) VALUES ($1, 'Theirs') RETURNING id`,
          [OTHER],
        )
        await q(
          `INSERT INTO coffees (user_id, name, roaster_id) VALUES ($1, 'Mine', $2)`,
          [OWNER, theirs.rows[0].id],
        )
        const coffee = await q(
          `INSERT INTO coffees (user_id, name) VALUES ($1, 'Theirs') RETURNING id`,
          [OTHER],
        )
        const grinder = await q(
          `INSERT INTO grinders (user_id, name, brand) VALUES ($1, 'Mine', 'B') RETURNING id`,
          [OWNER],
        )
        await q(
          `INSERT INTO espresso_shots (user_id, coffee_id, grinder_id, brewing_device_id)
           VALUES ($1, $2, $3, gen_random_uuid()), ($1, $2, $3, gen_random_uuid())`,
          [OWNER, coffee.rows[0].id, grinder.rows[0].id],
        )
      }),
    ).rejects.toThrow(
      /coffees\.roaster_id: 1;.*espresso_shots\.coffee_id: 2;/,
    )
  })

  it('goes ahead when every reference is shared or the owner’s', async () => {
    await expect(
      replayGuard(async (client) => {
        const q = (text: string, values?: Array<unknown>) =>
          client.query<{ id: string }>(text, values)
        const shared = await q(
          `INSERT INTO roasters (name) VALUES ('owned-references shared') RETURNING id`,
        )
        const own = await q(
          `INSERT INTO roast_levels (user_id, name) VALUES ($1, 'Own') RETURNING id`,
          [OWNER],
        )
        await q(
          `INSERT INTO coffees (user_id, name, roaster_id, roast_level_id) VALUES ($1, 'Mine', $2, $3)`,
          [OWNER, shared.rows[0].id, own.rows[0].id],
        )
      }),
    ).resolves.toBeUndefined()
  })
})
