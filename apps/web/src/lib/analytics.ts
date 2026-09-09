import type { PostHogConfig } from 'posthog-js'
import type { BillingPeriod, PlanId } from './plans'
// Product analytics (PostHog), gated on a public key the same way Sentry is
// gated on its DSN. Components import only this module, never the vendor SDK.

const DEFAULT_HOST = 'https://us.i.posthog.com'

function trim(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed || undefined
}

export function analyticsClientKey(): string | undefined {
  return trim(import.meta.env.VITE_POSTHOG_KEY)
}

export function analyticsHost(): string {
  return trim(import.meta.env.VITE_POSTHOG_HOST) ?? DEFAULT_HOST
}

export function analyticsEnabled(key: string | undefined): key is string {
  return key != null
}

export type PageView = {
  $pathname: string
  // Overrides the SDK's own value, which would carry the query string.
  $current_url: string
  // The route pattern, so a Brew's edit page is one route rather than one per id.
  route: string
}

export function pageViewFrom(
  location: { pathname: string; search?: unknown },
  matches: ReadonlyArray<{ fullPath: string }>,
): PageView {
  const route = matches.at(-1)?.fullPath ?? location.pathname
  return {
    $pathname: location.pathname,
    $current_url: location.pathname,
    route,
  }
}

export type AnalyticsClient = {
  capture: (event: string, properties?: Record<string, unknown>) => void
  identify: (id: string, properties?: Record<string, unknown>) => void
  reset: () => void
}

let client: AnalyticsClient | undefined

export function setAnalyticsClient(next: AnalyticsClient | undefined) {
  client = next
}

// Undefined during server rendering, and whenever no key was configured.
function active(): AnalyticsClient | undefined {
  return typeof window === 'undefined' ? undefined : client
}

export function trackPageView(view: PageView) {
  active()?.capture('$pageview', view)
}

export type BrewMethod =
  | 'espresso'
  | 'pourover'
  | 'frenchpress'
  | 'aeropress'
  | 'coldbrew'

// The brewing funnel. Properties name a Plan, a period, or a Brewing Method;
// never a Coffee, a Brew, or a piece of equipment.
export type Events = {
  sign_in_started: { from: 'landing' | 'pricing' | 'header' }
  coffee_created: undefined
  brew_logged: { method: BrewMethod }
  brew_dialed_in: { method: BrewMethod }
  interest_registered: { plan: PlanId }
  checkout_started: { plan: PlanId; period: BillingPeriod }
}

export function track<TEvent extends keyof Events>(
  event: TEvent,
  ...properties: Events[TEvent] extends undefined ? [] : [Events[TEvent]]
) {
  active()?.capture(event, properties[0])
}

export type Identity = { id: string }

// The Plan is the only person property PostHog gets; never email or name.
export function identityFrom(session: { user: { id: string } }): Identity {
  return { id: session.user.id }
}

export function identifyUser(identity: Identity, properties: { plan: string }) {
  active()?.identify(identity.id, properties)
}

export function resetAnalytics() {
  active()?.reset()
}

export function analyticsOptions(host: string) {
  return {
    api_host: host,
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    disable_surveys: true,
    person_profiles: 'identified_only',
  } satisfies Partial<PostHogConfig>
}
