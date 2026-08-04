import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { absoluteUrl } from './site-url'

// jsdom always supplies a window, so these cover the precedence that matters:
// a configured origin must beat the host the visitor actually arrived on.
describe('absoluteUrl', () => {
  const saved = {
    SITE_URL: process.env.SITE_URL,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
  }

  beforeEach(() => {
    delete process.env.SITE_URL
    delete process.env.BETTER_AUTH_URL
  })

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it('advertises the configured origin, not the one the page was served from', () => {
    process.env.SITE_URL = 'https://coffee.example'

    // window.location.origin is localhost here, and must lose: a page served
    // from a preview domain still advertises the canonical origin.
    expect(absoluteUrl('/pricing')).toBe('https://coffee.example/pricing')
  })

  it('falls back to the runtime auth URL, so existing deployments need no new config', () => {
    process.env.BETTER_AUTH_URL = 'https://auth.example'

    expect(absoluteUrl('/pricing')).toBe('https://auth.example/pricing')
  })

  it('prefers SITE_URL over the auth URL when both are set', () => {
    process.env.SITE_URL = 'https://canonical.example'
    process.env.BETTER_AUTH_URL = 'https://auth.example'

    expect(absoluteUrl('/')).toBe('https://canonical.example/')
  })

  it('falls back to the browser origin when nothing is configured', () => {
    expect(absoluteUrl('/pricing')).toBe(`${window.location.origin}/pricing`)
  })

  it('returns an absolute URL, since a relative one is worse than none', () => {
    process.env.SITE_URL = 'https://coffee.example'

    expect(absoluteUrl('/og-default.png')).toMatch(/^https:\/\//)
  })
})
