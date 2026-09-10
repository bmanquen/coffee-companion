import type { CaptureResult, PostHogConfig } from 'posthog-js'
import type { BillingPeriod, PlanId } from './plans'
// What may leave the app, and why, is ADR-0009.

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

// A route's search params are the user's own words — a Coffee's name typed into
// a filter, the plan they pressed. `$pageview` rewrites $current_url to the
// route pattern, but every other event keeps whatever posthog-js read off
// `window.location`, so the cut happens once here for all of them.
const URL_SHAPED_KEY = /(url|referrer|pathname)$/i

function cutQuery(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const end = value.search(/[?#]/)
  return end === -1 ? value : value.slice(0, end)
}

function scrubProperties(properties: Record<string, unknown> | undefined) {
  if (!properties) return properties
  return Object.fromEntries(
    Object.entries(properties).map(([key, value]) => [
      key,
      URL_SHAPED_KEY.test(key) ? cutQuery(value) : value,
    ]),
  )
}

export function scrubAnalyticsEvent(
  result: CaptureResult | null,
): CaptureResult | null {
  if (!result) return null
  const next = { ...result, properties: scrubProperties(result.properties)! }
  if (result.$set) next.$set = scrubProperties(result.$set)!
  if (result.$set_once) next.$set_once = scrubProperties(result.$set_once)!
  return next
}

export type PageView = {
  $pathname: string
  $current_url: string
}

export function pageViewFrom(
  location: { pathname: string },
  matches: ReadonlyArray<{ fullPath: string }>,
): PageView {
  const route = matches.at(-1)?.fullPath ?? location.pathname
  return { $pathname: route, $current_url: route }
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

export type BrewingMethod =
  | 'espresso'
  | 'pourover'
  | 'frenchpress'
  | 'aeropress'
  | 'coldbrew'

export type Events = {
  sign_in_started: { from: 'landing' | 'pricing' | 'header' }
  coffee_created: undefined
  brew_logged: { method: BrewingMethod }
  brew_dialed_in: { method: BrewingMethod }
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

// The session carries the email, name, and avatar; the id is all that leaves.
export function identityFrom(session: { user: { id: string } }): Identity {
  return { id: session.user.id }
}

export function identifyUser(identity: Identity, properties: { plan: PlanId }) {
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
    before_send: scrubAnalyticsEvent,
  } satisfies Partial<PostHogConfig>
}
