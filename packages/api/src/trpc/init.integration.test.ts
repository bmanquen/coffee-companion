import { afterAll, describe, expect, it } from 'vitest'
import { db } from '../db'
import { anonCaller } from '../../test/trpc'

// authedProcedure is wired in init.ts; verify it rejects a request with no
// session (no bypass cookie → real better-auth resolves no session).
afterAll(async () => {
  await db.$client.end()
})

describe('authedProcedure', () => {
  it('rejects unauthenticated requests', async () => {
    await expect(anonCaller.coffee.getAll()).rejects.toThrow(/UNAUTHORIZED/)
  })
})
