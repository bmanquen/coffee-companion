import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../db', () => ({ db: {} }))

// One probe is shared across callers, so each test gets its own module.
async function loadCheckDatabase() {
  vi.resetModules()
  return (await import('./health')).checkDatabase
}

afterEach(() => {
  vi.useRealTimers()
})

describe('checkDatabase', () => {
  it('is ok when the query answers', async () => {
    const checkDatabase = await loadCheckDatabase()

    await expect(checkDatabase(async () => [{ ok: 1 }])).resolves.toBe('ok')
  })

  it('is unreachable when the query fails, rather than throwing', async () => {
    const checkDatabase = await loadCheckDatabase()

    await expect(
      checkDatabase(async () => {
        throw new Error('ECONNREFUSED')
      }),
    ).resolves.toBe('unreachable')
  })

  it('is unreachable once the bounded wait passes, when the query never answers', async () => {
    const checkDatabase = await loadCheckDatabase()
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

  it('holds one query open however many callers arrive, so a stall cannot drain the pool', async () => {
    const checkDatabase = await loadCheckDatabase()
    vi.useFakeTimers()

    let queries = 0
    const query = () => {
      queries += 1
      return new Promise<unknown>(() => {})
    }

    const answers = Promise.all([
      checkDatabase(query),
      checkDatabase(query),
      checkDatabase(query),
    ])

    await vi.advanceTimersByTimeAsync(2_000)
    await expect(answers).resolves.toEqual([
      'unreachable',
      'unreachable',
      'unreachable',
    ])
    expect(queries).toBe(1)
  })

  it('queries again once the database has answered', async () => {
    const checkDatabase = await loadCheckDatabase()

    let queries = 0
    const query = async () => {
      queries += 1
      return [{ ok: 1 }]
    }

    await expect(checkDatabase(query)).resolves.toBe('ok')
    await expect(checkDatabase(query)).resolves.toBe('ok')
    expect(queries).toBe(2)
  })

  it('is unreachable again after a failure, rather than answering from the failed probe', async () => {
    const checkDatabase = await loadCheckDatabase()

    let queries = 0
    const query = async () => {
      queries += 1
      throw new Error('ECONNREFUSED')
    }

    await expect(checkDatabase(query)).resolves.toBe('unreachable')
    await expect(checkDatabase(query)).resolves.toBe('unreachable')
    expect(queries).toBe(2)
  })
})
