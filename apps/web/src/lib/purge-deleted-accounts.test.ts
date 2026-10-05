// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { purgeDeletedAccountsResponse } from './purge-deleted-accounts'

const HTTP_OK = 200
const HTTP_UNAUTHORIZED = 401
const HTTP_NOT_FOUND = 404
const HTTP_METHOD_NOT_ALLOWED = 405

describe('purgeDeletedAccountsResponse', () => {
  const original = process.env.PURGE_SECRET

  afterEach(() => {
    if (original === undefined) delete process.env.PURGE_SECRET
    else process.env.PURGE_SECRET = original
  })

  it('is missing when no purge secret is configured', async () => {
    delete process.env.PURGE_SECRET
    const response = await purgeDeletedAccountsResponse(
      new Request('https://app.test/api/purge-deleted-accounts', {
        method: 'POST',
      }),
    )

    expect(response.status).toBe(HTTP_NOT_FOUND)
  })

  it('refuses a missing or wrong bearer token', async () => {
    const purge = vi.fn()
    const missing = await purgeDeletedAccountsResponse(
      new Request('https://app.test/api/purge-deleted-accounts', {
        method: 'POST',
      }),
      'secret',
      purge,
    )
    const wrong = await purgeDeletedAccountsResponse(
      new Request('https://app.test/api/purge-deleted-accounts', {
        method: 'POST',
        headers: { authorization: 'Bearer nope' },
      }),
      'secret',
      purge,
    )

    expect(missing.status).toBe(HTTP_UNAUTHORIZED)
    expect(wrong.status).toBe(HTTP_UNAUTHORIZED)
    expect(purge).not.toHaveBeenCalled()
  })

  it('refuses a method other than POST', async () => {
    const response = await purgeDeletedAccountsResponse(
      new Request('https://app.test/api/purge-deleted-accounts'),
      'secret',
    )

    expect(response.status).toBe(HTTP_METHOD_NOT_ALLOWED)
  })

  it('purges and reports how many accounts were erased', async () => {
    const purge = vi.fn().mockResolvedValue({ purged: 2 })
    const response = await purgeDeletedAccountsResponse(
      new Request('https://app.test/api/purge-deleted-accounts', {
        method: 'POST',
        headers: { authorization: 'Bearer secret' },
      }),
      'secret',
      purge,
    )

    expect(response.status).toBe(HTTP_OK)
    expect(response.headers.get('cache-control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({ purged: 2 })
    expect(purge).toHaveBeenCalledOnce()
  })
})
