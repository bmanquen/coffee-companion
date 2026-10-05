import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PERSON_DELETE_CONFIGURED_PATH,
  fetchPersonDeleteConfigured,
  personDeleteConfigured,
  personDeleteConfiguredResponse,
} from './person-delete-configured'

const vars = ['POSTHOG_PERSONAL_API_KEY', 'POSTHOG_PROJECT_ID', 'POSTHOG_HOST']

let saved: Record<string, string | undefined>

beforeEach(() => {
  saved = Object.fromEntries(vars.map((name) => [name, process.env[name]]))
  for (const name of vars) delete process.env[name]
  vi.unstubAllEnvs()
})

afterEach(() => {
  for (const name of vars) {
    if (saved[name] === undefined) delete process.env[name]
    else process.env[name] = saved[name]
  }
  vi.unstubAllEnvs()
})

describe('personDeleteConfigured', () => {
  it('is off when no personal API key is set', () => {
    expect(personDeleteConfigured()).toBe(false)
  })

  it('is on when the person-delete call can run', () => {
    process.env.POSTHOG_PERSONAL_API_KEY = 'phx_test'
    process.env.POSTHOG_PROJECT_ID = '12345'

    expect(personDeleteConfigured()).toBe(true)
  })
})

describe('personDeleteConfiguredResponse', () => {
  it('answers from the server env, not the client bundle', async () => {
    process.env.POSTHOG_PERSONAL_API_KEY = 'phx_test'
    process.env.POSTHOG_PROJECT_ID = '12345'

    const response = personDeleteConfiguredResponse()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({ configured: true })
  })
})

describe('fetchPersonDeleteConfigured', () => {
  it('takes the server answer on a client navigation, not the client env', async () => {
    process.env.POSTHOG_PERSONAL_API_KEY = 'phx_test'
    process.env.POSTHOG_PROJECT_ID = '12345'
    const fetchImpl = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ configured: false }),
    })

    await expect(fetchPersonDeleteConfigured(fetchImpl)).resolves.toBe(false)
    expect(fetchImpl).toHaveBeenCalledWith(PERSON_DELETE_CONFIGURED_PATH)
  })

  it('treats a configured server answer as configured', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ configured: true }),
    })

    await expect(fetchPersonDeleteConfigured(fetchImpl)).resolves.toBe(true)
  })

  it('does not promise a person delete when the probe never arrives', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('offline'))

    await expect(fetchPersonDeleteConfigured(fetchImpl)).resolves.toBe(false)
  })
})
