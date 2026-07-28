// The public origin marketing pages advertise themselves under — canonical
// URLs and Open Graph tags need an absolute address, and a relative one is
// worse than none (crawlers and link unfurlers both drop it).
//
// SITE_URL wins wherever it is set, including in the browser. That is the whole
// point of a *canonical* origin: a page served from a preview domain, or from
// www when the canonical is the apex, must still advertise the configured one.
// Deriving it from window.location would quietly republish whatever host the
// visitor happened to arrive on. Where SITE_URL is unset we fall back to the
// browser's origin, then to the runtime auth URL, so local development and
// existing deployments need no new configuration.
const FALLBACK_ORIGIN = 'http://localhost:3000'

function configuredOrigin(): string | undefined {
  // Guarded so the client bundle never reaches for process; mirrors
  // auth-client.ts, which resolves its base URL the same way.
  if (typeof process === 'undefined') return undefined
  return process.env.SITE_URL || process.env.BETTER_AUTH_URL || undefined
}

function siteUrl(): string {
  const configured = configuredOrigin()
  if (configured) return configured
  if (typeof window !== 'undefined') return window.location.origin
  return FALLBACK_ORIGIN
}

// Absolute URL for a path on this site, for canonical and og:url tags.
export function absoluteUrl(path: string): string {
  return new URL(path, siteUrl()).toString()
}
