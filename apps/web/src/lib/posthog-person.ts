export type PersonErasureConfig = {
  apiKey: string
  projectId: string
  host: string
}

const DEFAULT_HOST = 'https://us.i.posthog.com'
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

  return {
    apiKey,
    projectId,
    host: stripTrailingSlash(trim(process.env.POSTHOG_HOST) ?? DEFAULT_HOST),
  }
}

export async function deletePostHogPerson(
  accountId: string,
  fetchImpl: typeof fetch = fetch,
) {
  const config = posthogPersonConfig()
  if (!config) return

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
