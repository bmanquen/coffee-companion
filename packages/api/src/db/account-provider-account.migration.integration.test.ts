import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import type { PoolClient } from 'pg'

const MIGRATION_SQL = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    '../../drizzle/20261016213625_account_provider_account_unique/migration.sql',
  ),
  'utf8',
)

const [refuseCrossUser, copyCredentials, deleteSameUser, createUniqueIndex] =
  MIGRATION_SQL.split('--> statement-breakpoint').map((statement) =>
    statement.trim(),
  )

if (
  !refuseCrossUser ||
  !copyCredentials ||
  !deleteSameUser ||
  !createUniqueIndex
) {
  throw new Error(
    'expected the account uniqueness migration to refuse cross-user duplicates, copy credentials, delete same-user duplicates, then create the index',
  )
}

const KEEPER_ID = 'acct-keeper'
const DUPE_ID = 'acct-dupe'
const THIRD_ID = 'acct-third'
const OTHER_USER = 'acct-other-user'

let pool: Pool

beforeAll(() => {
  pool = new Pool()
})

afterAll(async () => {
  await pool.end()
})

async function withLegacyAccounts(
  seeds: Array<{
    id: string
    userId: string
    createdAt: string
    updatedAt?: string
    refreshToken?: string | null
    accessToken?: string | null
    idToken?: string | null
    accessTokenExpiresAt?: string | null
    refreshTokenExpiresAt?: string | null
    scope?: string | null
    password?: string | null
  }>,
  run: (client: PoolClient) => Promise<void>,
) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`
      CREATE TEMP TABLE account (
        id text PRIMARY KEY,
        account_id text NOT NULL,
        provider_id text NOT NULL,
        user_id text NOT NULL,
        refresh_token text,
        access_token text,
        id_token text,
        access_token_expires_at timestamp,
        refresh_token_expires_at timestamp,
        scope text,
        password text,
        created_at timestamp NOT NULL,
        updated_at timestamp NOT NULL
      ) ON COMMIT DROP
    `)
    for (const seed of seeds) {
      await client.query(
        `INSERT INTO account (
           id, account_id, provider_id, user_id,
           refresh_token, access_token, id_token,
           access_token_expires_at, refresh_token_expires_at,
           scope, password, created_at, updated_at
         ) VALUES (
           $1, 'apple.sub.legacy', 'apple', $2,
           $3, $4, $5,
           $6::timestamp, $7::timestamp,
           $8, $9, $10::timestamp, $11::timestamp
         )`,
        [
          seed.id,
          seed.userId,
          seed.refreshToken === undefined ? null : seed.refreshToken,
          seed.accessToken === undefined ? null : seed.accessToken,
          seed.idToken === undefined ? null : seed.idToken,
          seed.accessTokenExpiresAt ?? null,
          seed.refreshTokenExpiresAt ?? null,
          seed.scope === undefined ? null : seed.scope,
          seed.password === undefined ? null : seed.password,
          seed.createdAt,
          seed.updatedAt ?? seed.createdAt,
        ],
      )
    }
    await run(client)
  } finally {
    await client.query('ROLLBACK')
    client.release()
  }
}

describe('account provider and account id uniqueness migration', () => {
  it('keeps the oldest same-user duplicate, then creates the unique index', async () => {
    await withLegacyAccounts(
      [
        {
          id: KEEPER_ID,
          userId: 'acct-same-user',
          createdAt: '2026-01-01 00:00:00',
        },
        {
          id: DUPE_ID,
          userId: 'acct-same-user',
          createdAt: '2026-01-02 00:00:00',
        },
      ],
      async (client) => {
        await client.query(refuseCrossUser)
        await client.query(copyCredentials)
        await client.query(deleteSameUser)
        await client.query(createUniqueIndex)

        const { rows } = await client.query<{ id: string }>(
          'SELECT id FROM account ORDER BY created_at',
        )
        expect(rows.map((row) => row.id)).toEqual([KEEPER_ID])
      },
    )
  })

  it('copies a later refresh token onto the oldest same-user row', async () => {
    await withLegacyAccounts(
      [
        {
          id: KEEPER_ID,
          userId: 'acct-same-user',
          createdAt: '2026-01-01 00:00:00',
          refreshToken: null,
        },
        {
          id: DUPE_ID,
          userId: 'acct-same-user',
          createdAt: '2026-01-02 00:00:00',
          refreshToken: 'rt_later',
        },
      ],
      async (client) => {
        await client.query(refuseCrossUser)
        await client.query(copyCredentials)
        await client.query(deleteSameUser)
        await client.query(createUniqueIndex)

        const { rows } = await client.query<{
          id: string
          refresh_token: string | null
        }>('SELECT id, refresh_token FROM account')
        expect(rows).toEqual([
          { id: KEEPER_ID, refresh_token: 'rt_later' },
        ])
      },
    )
  })

  it('copies a refresh token from one of three same-user rows onto the oldest', async () => {
    await withLegacyAccounts(
      [
        {
          id: KEEPER_ID,
          userId: 'acct-same-user',
          createdAt: '2026-01-01 00:00:00',
          refreshToken: null,
        },
        {
          id: DUPE_ID,
          userId: 'acct-same-user',
          createdAt: '2026-01-02 00:00:00',
          refreshToken: null,
        },
        {
          id: THIRD_ID,
          userId: 'acct-same-user',
          createdAt: '2026-01-03 00:00:00',
          refreshToken: 'rt_only',
        },
      ],
      async (client) => {
        await client.query(refuseCrossUser)
        await client.query(copyCredentials)
        await client.query(deleteSameUser)
        await client.query(createUniqueIndex)

        const { rows } = await client.query<{
          id: string
          refresh_token: string | null
        }>('SELECT id, refresh_token FROM account')
        expect(rows).toEqual([{ id: KEEPER_ID, refresh_token: 'rt_only' }])
      },
    )
  })

  it('copies one source row’s credentials when the newest token and newest expiry differ', async () => {
    await withLegacyAccounts(
      [
        {
          id: KEEPER_ID,
          userId: 'acct-same-user',
          createdAt: '2026-01-01 00:00:00',
        },
        {
          id: DUPE_ID,
          userId: 'acct-same-user',
          createdAt: '2026-01-02 00:00:00',
          updatedAt: '2026-01-02 00:00:00',
          refreshToken: 'rt_old',
          accessToken: 'at_old',
          idToken: 'id_old',
          accessTokenExpiresAt: '2099-01-01 00:00:00',
          refreshTokenExpiresAt: '2099-06-01 00:00:00',
          scope: 'old-scope',
          password: 'old-pass',
        },
        {
          id: THIRD_ID,
          userId: 'acct-same-user',
          createdAt: '2026-01-03 00:00:00',
          updatedAt: '2026-01-03 00:00:00',
          refreshToken: 'rt_src',
          accessToken: 'at_src',
          idToken: 'id_src',
          accessTokenExpiresAt: '2026-02-01 00:00:00',
          refreshTokenExpiresAt: '2026-03-01 00:00:00',
          scope: 'src-scope',
          password: 'src-pass',
        },
      ],
      async (client) => {
        await client.query(refuseCrossUser)
        await client.query(copyCredentials)
        await client.query(deleteSameUser)
        await client.query(createUniqueIndex)

        const { rows } = await client.query<{
          id: string
          refresh_token: string | null
          access_token: string | null
          id_token: string | null
          access_token_expires_at: string | null
          refresh_token_expires_at: string | null
          scope: string | null
          password: string | null
        }>(
          `SELECT id, refresh_token, access_token, id_token,
                  to_char(access_token_expires_at, 'YYYY-MM-DD HH24:MI:SS')
                    AS access_token_expires_at,
                  to_char(refresh_token_expires_at, 'YYYY-MM-DD HH24:MI:SS')
                    AS refresh_token_expires_at,
                  scope, password
           FROM account`,
        )
        expect(rows).toEqual([
          {
            id: KEEPER_ID,
            refresh_token: 'rt_src',
            access_token: 'at_src',
            id_token: 'id_src',
            access_token_expires_at: '2026-02-01 00:00:00',
            refresh_token_expires_at: '2026-03-01 00:00:00',
            scope: 'src-scope',
            password: 'src-pass',
          },
        ])
      },
    )
  })

  it('prefers an older refresh-token row over a newer access-token-only row', async () => {
    await withLegacyAccounts(
      [
        {
          id: KEEPER_ID,
          userId: 'acct-same-user',
          createdAt: '2026-01-01 00:00:00',
        },
        {
          id: DUPE_ID,
          userId: 'acct-same-user',
          createdAt: '2026-01-02 00:00:00',
          updatedAt: '2026-01-02 00:00:00',
          refreshToken: 'rt_keep',
          accessToken: 'at_keep',
          idToken: 'id_keep',
          accessTokenExpiresAt: '2026-04-01 00:00:00',
          refreshTokenExpiresAt: '2026-05-01 00:00:00',
          scope: 'keep-scope',
          password: 'keep-pass',
        },
        {
          id: THIRD_ID,
          userId: 'acct-same-user',
          createdAt: '2026-01-03 00:00:00',
          updatedAt: '2026-01-03 00:00:00',
          refreshToken: null,
          accessToken: 'at_newer',
          idToken: 'id_newer',
          accessTokenExpiresAt: '2099-01-01 00:00:00',
          scope: 'newer-scope',
          password: 'newer-pass',
        },
      ],
      async (client) => {
        await client.query(refuseCrossUser)
        await client.query(copyCredentials)
        await client.query(deleteSameUser)
        await client.query(createUniqueIndex)

        const { rows } = await client.query<{
          id: string
          refresh_token: string | null
          access_token: string | null
          id_token: string | null
          access_token_expires_at: string | null
          refresh_token_expires_at: string | null
          scope: string | null
          password: string | null
        }>(
          `SELECT id, refresh_token, access_token, id_token,
                  to_char(access_token_expires_at, 'YYYY-MM-DD HH24:MI:SS')
                    AS access_token_expires_at,
                  to_char(refresh_token_expires_at, 'YYYY-MM-DD HH24:MI:SS')
                    AS refresh_token_expires_at,
                  scope, password
           FROM account`,
        )
        expect(rows).toEqual([
          {
            id: KEEPER_ID,
            refresh_token: 'rt_keep',
            access_token: 'at_keep',
            id_token: 'id_keep',
            access_token_expires_at: '2026-04-01 00:00:00',
            refresh_token_expires_at: '2026-05-01 00:00:00',
            scope: 'keep-scope',
            password: 'keep-pass',
          },
        ])
      },
    )
  })

  it('refuses when the same provider account is linked to two users', async () => {
    await withLegacyAccounts(
      [
        {
          id: KEEPER_ID,
          userId: 'acct-same-user',
          createdAt: '2026-01-01 00:00:00',
        },
        {
          id: DUPE_ID,
          userId: OTHER_USER,
          createdAt: '2026-01-02 00:00:00',
        },
      ],
      async (client) => {
        await expect(client.query(refuseCrossUser)).rejects.toThrow(
          /same provider_id and account_id on more than one user/,
        )
      },
    )
  })
})
