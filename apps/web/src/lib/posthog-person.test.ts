import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deletePostHogPerson, posthogPersonConfig } from './posthog-person'

const vars = ['POSTHOG_PERSONAL_API_KEY', 'POSTHOG_PROJECT_ID', 'POSTHOG_HOST']

let saved: Record<string, string | undefined>

beforeEach(() => {
  saved = Object.fromEntries(vars.map((name) => [name, process.env[name]]))
  for (const name of vars) delete process.env[name]
})

afterEach(() => {
  for (const name of vars) {
    if (saved[name] === undefined) delete process.env[name]
    else process.env[name] = saved[name]
  }
})

describe('posthogPersonConfig', () => {
  it('is off when no personal API key is set', () => {
    expect(posthogPersonConfig()).toBe(null)
  })

  it('refuses a key without a project, so the fix is not to invent one', () => {
    process.env.POSTHOG_PERSONAL_API_KEY = 'phx_test'

    expect(() => posthogPersonConfig()).toThrow(/POSTHOG_PROJECT_ID/)
  })

  it('reads the host, defaulting to PostHog US', () => {
    process.env.POSTHOG_PERSONAL_API_KEY = 'phx_test'
    process.env.POSTHOG_PROJECT_ID = '12345'

    expect(posthogPersonConfig()).toEqual({
      apiKey: 'phx_test',
      projectId: '12345',
      host: 'https://us.i.posthog.com',
    })

    process.env.POSTHOG_HOST = ' https://eu.i.posthog.com/ '
    expect(posthogPersonConfig()?.host).toBe('https://eu.i.posthog.com')
  })
})

describe('deletePostHogPerson', () => {
  it('sends nothing when PostHog erasure is not configured', async () => {
    const fetchImpl = vi.fn()

    await deletePostHogPerson('user_123', fetchImpl)

    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('deletes the person keyed by the account id', async () => {
    process.env.POSTHOG_PERSONAL_API_KEY = 'phx_test'
    process.env.POSTHOG_PROJECT_ID = '12345'
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 })

    await deletePostHogPerson('user_123', fetchImpl)

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://us.i.posthog.com/api/projects/12345/persons/bulk_delete/',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer phx_test',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ distinct_ids: ['user_123'] }),
      }),
    )
  })

  it('treats an already-gone person as erased', async () => {
    process.env.POSTHOG_PERSONAL_API_KEY = 'phx_test'
    process.env.POSTHOG_PROJECT_ID = '12345'
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404 })

    await expect(
      deletePostHogPerson('user_123', fetchImpl),
    ).resolves.toBeUndefined()
  })

  it('says so when PostHog refuses the delete', async () => {
    process.env.POSTHOG_PERSONAL_API_KEY = 'phx_test'
    process.env.POSTHOG_PROJECT_ID = '12345'
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 401 })

    await expect(deletePostHogPerson('user_123', fetchImpl)).rejects.toThrow(
      /PostHog person delete failed \(401\)/,
    )
  })
})
