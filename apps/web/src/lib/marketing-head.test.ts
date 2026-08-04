import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { marketingHead } from './marketing-head'

// The tags exist so a shared link unfurls as a card rather than a blank
// rectangle, which is exactly the kind of omission nobody catches by looking at
// the page. So this asserts the tags are present and absolute, not the prose.
describe('marketingHead', () => {
  const saved = process.env.SITE_URL

  beforeEach(() => {
    process.env.SITE_URL = 'https://coffee.example'
  })

  afterEach(() => {
    if (saved === undefined) delete process.env.SITE_URL
    else process.env.SITE_URL = saved
  })

  const head = () =>
    marketingHead({
      title: 'Pricing',
      description: 'What each Plan holds.',
      path: '/pricing',
    })

  const metaByKey = (key: 'name' | 'property') =>
    Object.fromEntries(
      head()
        .meta.filter((tag) => key in tag)
        .map((tag) => {
          const entry = tag as unknown as Record<string, string>
          return [entry[key], entry.content]
        }),
    )

  it('carries the title and description as both Open Graph and Twitter tags', () => {
    const property = metaByKey('property')
    const name = metaByKey('name')

    expect(head().meta[0]).toEqual({ title: 'Pricing' })
    expect(name.description).toBe('What each Plan holds.')
    expect(property['og:title']).toBe('Pricing')
    expect(property['og:description']).toBe('What each Plan holds.')
    expect(name['twitter:title']).toBe('Pricing')
    expect(name['twitter:description']).toBe('What each Plan holds.')
  })

  it('resolves the page and its card image to absolute URLs', () => {
    const property = metaByKey('property')

    expect(property['og:url']).toBe('https://coffee.example/pricing')
    expect(property['og:image']).toBe(
      'https://coffee.example/og-default.png',
    )
    expect(metaByKey('name')['twitter:image']).toBe(
      'https://coffee.example/og-default.png',
    )
  })

  it('advertises a PNG card, since unfurlers drop an SVG og:image', () => {
    expect(metaByKey('property')['og:image']).toMatch(/\.png$/)
    expect(metaByKey('property')['og:image:width']).toBe('1200')
    expect(metaByKey('property')['og:image:height']).toBe('630')
    expect(metaByKey('name')['twitter:card']).toBe('summary_large_image')
  })

  it('points the canonical link at the same absolute URL as og:url', () => {
    expect(head().links).toEqual([
      { rel: 'canonical', href: 'https://coffee.example/pricing' },
    ])
  })
})
