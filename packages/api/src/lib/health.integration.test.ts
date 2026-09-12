import { describe, expect, it } from 'vitest'
import { checkDatabase } from './health'

describe('checkDatabase', () => {
  it('is ok against a reachable database', async () => {
    await expect(checkDatabase()).resolves.toBe('ok')
  })
})
