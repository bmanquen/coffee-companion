import { describe, expect, it } from 'vitest'
import { healthResponse } from './health'

describe('healthResponse', () => {
  it('is 200 and ok when the database answers', async () => {
    const response = healthResponse('ok')

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({ status: 'ok', db: 'ok' })
  })

  it('is 503 and degraded when the database does not', async () => {
    const response = healthResponse('unreachable')

    expect(response.status).toBe(503)
    expect(response.headers.get('cache-control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({
      status: 'degraded',
      db: 'unreachable',
    })
  })
})
