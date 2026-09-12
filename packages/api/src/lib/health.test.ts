import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkDatabase } from './health'

vi.mock('../db', () => ({ db: {} }))

afterEach(() => {
  vi.useRealTimers()
})

describe('checkDatabase', () => {
  it('is ok when the query answers', async () => {
    await expect(checkDatabase(async () => [{ ok: 1 }])).resolves.toBe('ok')
  })

  it('is unreachable when the query fails, rather than throwing', async () => {
    await expect(
      checkDatabase(async () => {
        throw new Error('ECONNREFUSED')
      }),
    ).resolves.toBe('unreachable')
  })

  it('is unreachable once the bounded wait passes, when the query never answers', async () => {
    vi.useFakeTimers()

    const pending = checkDatabase(() => new Promise(() => {}))
    let settled = false
    void pending.then(() => {
      settled = true
    })

    await vi.advanceTimersByTimeAsync(1_999)
    expect(settled).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    await expect(pending).resolves.toBe('unreachable')
  })
})
