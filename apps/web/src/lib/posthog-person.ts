import { log } from '@coffee-companion/api/lib/log'
import { reportError } from '@coffee-companion/api/lib/report-error'
import { analyticsHost } from './analytics'

export type PersonErasureConfig = {
  apiKey: string
  projectId: string
  host: string
}

const HTTP_NOT_FOUND = 404

function trim(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed || undefined
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/$/, '')
}

export function posthogPersonConfig(): PersonErasureConfig | null {
  const apiKey = trim(process.env.POSTHOG_PERSONAL_API_KEY)
  if (!apiKey) return null

  const projectId = trim(process.env.POSTHOG_PROJECT_ID)
  if (!projectId) {
    throw new Error(
      'POSTHOG_PROJECT_ID must be set whenever POSTHOG_PERSONAL_API_KEY is',
    )
  }

  // Same host as capture. A 404 from the wrong cloud would look like
  // "already gone" while the real person stayed on the capture host.
  const host = stripTrailingSlash(analyticsHost())
  const override = trim(process.env.POSTHOG_HOST)
  if (override && stripTrailingSlash(override) !== host) {
    throw new Error(
      'POSTHOG_HOST must match VITE_POSTHOG_HOST so person delete hits the same project as capture',
    )
  }

  return {
    apiKey,
    projectId,
    host,
  }
}

export async function deletePostHogPerson(
  accountId: string,
  fetchImpl: typeof fetch = fetch,
) {
  const config = posthogPersonConfig()
  if (!config) {
    const error = new Error(
      'PostHog person delete skipped: POSTHOG_PERSONAL_API_KEY is not set',
    )
    log('warn', error.message, {
      area: 'account',
      operation: 'erasePerson',
      accountId,
    })
    reportError(error, {
      tags: { area: 'account', operation: 'erasePerson' },
      user: { id: accountId },
    })
    return
  }

  const response = await fetchImpl(
    `${config.host}/api/projects/${config.projectId}/persons/bulk_delete/`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ distinct_ids: [accountId] }),
    },
  )

  // Already gone is erased — the person is not there to delete.
  if (response.ok || response.status === HTTP_NOT_FOUND) return
  throw new Error(`PostHog person delete failed (${response.status})`)
}
