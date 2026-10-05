import { createIsomorphicFn } from '@tanstack/react-start'
import { posthogPersonConfig } from './posthog-person'

export const PERSON_DELETE_CONFIGURED_PATH = '/api/person-delete-configured'

const HTTP_OK = 200

export function personDeleteConfigured(): boolean {
  return posthogPersonConfig() !== null
}

export function personDeleteConfiguredResponse(): Response {
  return Response.json(
    { configured: personDeleteConfigured() },
    {
      status: HTTP_OK,
      headers: { 'cache-control': 'no-store' },
    },
  )
}

export async function fetchPersonDeleteConfigured(
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const response = await fetchImpl(PERSON_DELETE_CONFIGURED_PATH)
    if (response.status !== HTTP_OK) return false
    const body: unknown = await response.json()
    return (
      typeof body === 'object' &&
      body !== null &&
      'configured' in body &&
      body.configured === true
    )
  } catch {
    // Privacy and account still have to open. Unknown is not a promise
    // that PostHog will delete the profile.
    return false
  }
}

export const loadPersonDeleteConfigured = createIsomorphicFn()
  .client(() => fetchPersonDeleteConfigured())
  .server(personDeleteConfigured)
