import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  analyticsClientKey,
  analyticsEnabled,
  analyticsHost,
  analyticsOptions,
  identifyUser,
  identityFrom,
  pageViewFrom,
  resetAnalytics,
  scrubAnalyticsEvent,
  setAnalyticsClient,
  track,
  trackPageView,
} from './analytics'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('analyticsClientKey', () => {
  it('treats a missing or blank VITE_POSTHOG_KEY as unset', () => {
    vi.stubEnv('VITE_POSTHOG_KEY', undefined)
    expect(analyticsClientKey()).toBeUndefined()

    vi.stubEnv('VITE_POSTHOG_KEY', '   ')
    expect(analyticsClientKey()).toBeUndefined()
  })

  it('keeps a real key', () => {
    vi.stubEnv('VITE_POSTHOG_KEY', ' phc_abc ')
    expect(analyticsClientKey()).toBe('phc_abc')
  })
})

describe('analyticsEnabled', () => {
  it('is off without a key and on with one', () => {
    expect(analyticsEnabled(undefined)).toBe(false)
    expect(analyticsEnabled('phc_abc')).toBe(true)
  })
})

describe('analyticsHost', () => {
  it('defaults to the PostHog US cloud', () => {
    vi.stubEnv('VITE_POSTHOG_HOST', undefined)
    expect(analyticsHost()).toBe('https://us.i.posthog.com')
  })

  it('takes a configured host, ignoring a blank one', () => {
    vi.stubEnv('VITE_POSTHOG_HOST', '  ')
    expect(analyticsHost()).toBe('https://us.i.posthog.com')

    vi.stubEnv('VITE_POSTHOG_HOST', 'https://eu.i.posthog.com')
    expect(analyticsHost()).toBe('https://eu.i.posthog.com')
  })
})

describe('pageViewFrom', () => {
  it('carries the matched route pattern, never the resolved id or the search', () => {
    const location = { pathname: '/brews/42/edit', search: { tab: 'notes' } }
    expect(
      pageViewFrom(location, [
        { fullPath: '/' },
        { fullPath: '/brews/$brewId/edit' },
      ]),
    ).toEqual({
      $pathname: '/brews/$brewId/edit',
      $current_url: '/brews/$brewId/edit',
    })
  })

  it('falls back to the pathname when nothing matched', () => {
    expect(pageViewFrom({ pathname: '/missing' }, [])).toEqual({
      $pathname: '/missing',
      $current_url: '/missing',
    })
  })
})

describe('identityFrom', () => {
  it('is the user id only, never the email, name, or avatar', () => {
    const session = {
      user: {
        id: 'user_123',
        email: 'ada@example.com',
        name: 'Ada',
        image: 'https://example.com/ada.png',
      },
      session: { token: 'secret' },
    }
    expect(identityFrom(session)).toEqual({ id: 'user_123' })
  })
})

describe('the analytics facade', () => {
  const fake = () => ({
    capture: vi.fn(),
    identify: vi.fn(),
    reset: vi.fn(),
  })

  afterEach(() => {
    setAnalyticsClient(undefined)
    vi.unstubAllGlobals()
  })

  it('forwards a page view to the client', () => {
    const client = fake()
    setAnalyticsClient(client)

    trackPageView({ $pathname: '/', $current_url: '/' })

    expect(client.capture).toHaveBeenCalledWith('$pageview', {
      $pathname: '/',
      $current_url: '/',
    })
  })

  it('drops everything when no client was booted', () => {
    expect(() =>
      trackPageView({ $pathname: '/', $current_url: '/' }),
    ).not.toThrow()
  })

  it('forwards a named event with its properties', () => {
    const client = fake()
    setAnalyticsClient(client)

    track('brew_logged', { method: 'espresso' })
    track('coffee_created')

    expect(client.capture).toHaveBeenCalledWith('brew_logged', {
      method: 'espresso',
    })
    expect(client.capture).toHaveBeenCalledWith('coffee_created', undefined)
  })

  it('rejects an event outside the closed union at compile time', () => {
    // @ts-expect-error a misspelled event is not in the union
    track('brew_loged', { method: 'espresso' })
    // @ts-expect-error a property outside the union is not allowed either
    track('brew_logged', { method: 'espresso', coffeeId: 'c1' })
    expect(true).toBe(true)
  })

  it('identifies a person by id with the Plan as the only property', () => {
    const client = fake()
    setAnalyticsClient(client)

    identifyUser({ id: 'user_123' }, { plan: 'pro' })

    expect(client.identify).toHaveBeenCalledWith('user_123', { plan: 'pro' })
  })

  it('forwards a reset', () => {
    const client = fake()
    setAnalyticsClient(client)

    resetAnalytics()

    expect(client.reset).toHaveBeenCalledOnce()
  })

  it('never touches the client without a window', () => {
    const client = fake()
    setAnalyticsClient(client)
    vi.stubGlobal('window', undefined)

    trackPageView({ $pathname: '/', $current_url: '/' })

    expect(client.capture).not.toHaveBeenCalled()
  })
})

describe('analyticsOptions', () => {
  it('turns off everything but what we send ourselves', () => {
    const options = analyticsOptions('https://eu.i.posthog.com')

    expect(options).toMatchObject({
      api_host: 'https://eu.i.posthog.com',
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
      disable_surveys: true,
      person_profiles: 'identified_only',
    })
  })
})

describe('scrubAnalyticsEvent', () => {
  it('cuts the query string and hash off every url-shaped property', () => {
    const event = scrubAnalyticsEvent({
      uuid: 'e1',
      event: 'checkout_started',
      properties: {
        $current_url: 'https://app.test/pricing?press=pro&email=a@b.com',
        $referrer: 'https://google.test/search?q=coffee+companion',
        $pathname: '/pricing?press=pro',
        plan: 'pro',
      },
      $set: { $initial_current_url: 'https://app.test/?invite=secret' },
    })

    expect(event?.properties).toMatchObject({
      $current_url: 'https://app.test/pricing',
      $referrer: 'https://google.test/search',
      $pathname: '/pricing',
      plan: 'pro',
    })
    expect(event?.$set).toEqual({ $initial_current_url: 'https://app.test/' })
  })

  it('leaves a route pattern and a null event alone', () => {
    expect(
      scrubAnalyticsEvent({
        uuid: 'e2',
        event: '$pageview',
        properties: { $current_url: '/coffees/$coffeeId', $pathname: '/coffees/$coffeeId' },
      })?.properties.$current_url,
    ).toBe('/coffees/$coffeeId')

    expect(scrubAnalyticsEvent(null)).toBeNull()
  })
})
