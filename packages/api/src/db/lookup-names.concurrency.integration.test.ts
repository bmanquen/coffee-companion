import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import { lookupNameClashMessage } from '../lib/lookup-name'
import { callerFor, seedUsers } from '../../test/trpc'

const ALICE = 'lookup-conc-alice'
const BOB = 'lookup-conc-bob'
const alice = callerFor(ALICE)
const bob = callerFor(BOB)

seedUsers([ALICE, BOB])

let pool: Pool

beforeAll(() => {
  pool = new Pool()
})

afterAll(async () => {
  await pool.end()
})

const ownSentence = (name: string) =>
  `You already have one called ${name}. Pick it there, or give this one a different name.`
const sharedSentence = (name: string) =>
  `${name} is already in the list. Pick it there, or give yours a different name.`

describe('lookup name races', () => {
  it('lets one same-user create win and names that casing', async () => {
    const stem = `Race ${Date.now()} ${Math.random()}`
    const results = await Promise.allSettled([
      alice.roaster.create({ name: stem }),
      alice.roaster.create({ name: stem.toLowerCase() }),
    ])
    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(rejected[0].reason).toMatchObject({
      code: 'CONFLICT',
      message: ownSentence(fulfilled[0].value.name),
    })
  })

  it('waits for the first same-user write, then fails with that casing', async () => {
    const saved = `Wait ${Date.now()} ${Math.random()}`
    const a = await pool.connect()
    const b = await pool.connect()
    try {
      await a.query('BEGIN')
      await a.query(
        `INSERT INTO roasters (name, user_id) VALUES ($1, $2)`,
        [saved, ALICE],
      )
      const pending = b.query(
        `INSERT INTO roasters (name, user_id) VALUES ($1, $2)`,
        [saved.toLowerCase(), ALICE],
      )
      await new Promise((resolve) => setTimeout(resolve, 200))
      await a.query('COMMIT')
      await expect(pending).rejects.toSatisfy(
        (error: unknown) => lookupNameClashMessage(error) === ownSentence(saved),
      )
    } finally {
      await a.query('ROLLBACK').catch(() => {})
      a.release()
      b.release()
    }
  })

  it('waits for an uncommitted shared write, then refuses the user copy', async () => {
    const saved = `SharedWait ${Date.now()} ${Math.random()}`
    const a = await pool.connect()
    const b = await pool.connect()
    try {
      await a.query('BEGIN')
      await a.query(`INSERT INTO roasters (name) VALUES ($1)`, [saved])
      const pending = b.query(
        `INSERT INTO roasters (name, user_id) VALUES ($1, $2)`,
        [saved.toLowerCase(), ALICE],
      )
      await new Promise((resolve) => setTimeout(resolve, 200))
      await a.query('COMMIT')
      await expect(pending).rejects.toSatisfy(
        (error: unknown) =>
          lookupNameClashMessage(error) === sharedSentence(saved),
      )
    } finally {
      await a.query('ROLLBACK').catch(() => {})
      a.release()
      b.release()
    }
  })

  it('lets a second user finish while the first user is still open', async () => {
    const saved = `TwoUsers ${Date.now()} ${Math.random()}`
    const a = await pool.connect()
    const b = await pool.connect()
    try {
      await a.query('BEGIN')
      await a.query(
        `INSERT INTO roasters (name, user_id) VALUES ($1, $2)`,
        [saved, ALICE],
      )
      const bobRow = await b.query(
        `INSERT INTO roasters (name, user_id) VALUES ($1, $2) RETURNING name, user_id`,
        [saved.toLowerCase(), BOB],
      )
      expect(bobRow.rows[0]).toEqual({
        name: saved.toLowerCase(),
        user_id: BOB,
      })
      await a.query('COMMIT')
    } finally {
      await a.query('ROLLBACK').catch(() => {})
      a.release()
      b.release()
    }
  })

  it('lets two users both create the same name through tRPC', async () => {
    const stem = `Both ${Date.now()} ${Math.random()}`
    const results = await Promise.allSettled([
      alice.roaster.create({ name: stem }),
      bob.roaster.create({ name: stem.toLowerCase() }),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2)
  })
})
