// The public origin marketing pages advertise themselves under — canonical
// URLs and Open Graph tags need an absolute address, and a relative one is
// worse than none (crawlers and link unfurlers both drop it).
//
// Mirrors the resolution in auth-client.ts: in the browser the current location
// is authoritative, and during SSR we fall back to the runtime env. SITE_URL is
// the knob; BETTER_AUTH_URL stands in when it is unset, so local development
// and existing deployments keep working without new configuration.
const FALLBACK_ORIGIN = 'http://localhost:3000'

export function siteUrl(): string {
  if (typeof window !== 'undefined') return window.location.origin
  return process.env.SITE_URL ?? process.env.BETTER_AUTH_URL ?? FALLBACK_ORIGIN
}

// Absolute URL for a path on this site, for canonical and og:url tags.
export function absoluteUrl(path: string): string {
  return new URL(path, siteUrl()).toString()
}
