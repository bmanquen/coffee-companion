import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { lookupSqlNames } from '../../test/lookups'

const DRIZZLE = join(dirname(fileURLToPath(import.meta.url)), '../../drizzle')
const THIS_MIGRATION = 'lookup_name_uniqueness'

const insertIntoLookup = new RegExp(
  `INSERT\\s+INTO\\s+"?(?:${lookupSqlNames().join('|')})"?(?:\\s|\\()`,
  'i',
)

describe('migrations after lookup name uniqueness', () => {
  it('fold any lookup insert so user copies merge into the new shared default', () => {
    const folders = readdirSync(DRIZZLE)
      .filter((name) => /^\d{14}_/.test(name))
      .sort()
    const here = folders.findIndex((name) => name.endsWith(`_${THIS_MIGRATION}`))
    expect(here).toBeGreaterThanOrEqual(0)

    const missing = folders.slice(here + 1).filter((folder) => {
      const sql = readFileSync(join(DRIZZLE, folder, 'migration.sql'), 'utf8')
      return insertIntoLookup.test(sql) && !sql.includes('lookup_fold()')
    })

    expect(missing).toEqual([])
  })
})

describe('seeds after lookup name uniqueness', () => {
  it('fold after lookup upserts so user copies merge into the new shared default', () => {
    const dir = dirname(fileURLToPath(import.meta.url))
    const seed = readFileSync(join(dir, 'seed.ts'), 'utf8')
    const seedE2e = readFileSync(join(dir, 'seed-e2e.ts'), 'utf8')
    expect(seed).toContain('SELECT * FROM lookup_fold()')
    expect(seedE2e).toContain('SELECT * FROM lookup_fold()')
  })
})
