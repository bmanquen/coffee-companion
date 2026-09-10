// What the privacy page says, as data rather than prose in a component: every
// claim here is one the app has to keep true, so it sits next to a test that
// checks it against ADR 0009 and ADR 0010.

// Vendor plan defaults, not yet checked against our own account settings
// (issue #122). Confirm both in the Sentry and PostHog dashboards before this
// page is served publicly.
const SENTRY_RETENTION =
  'Sentry keeps errors, traces, and replays for 90 days, then deletes them.'
const POSTHOG_RETENTION =
  'PostHog keeps events for 7 years and profiles for as long as the project exists.'

export type Recipient = {
  name: string
  purpose: string
  receives: Array<string>
  neverReceives: Array<string>
  retention: string
  lawfulBasis: string
  policyUrl: string
}

export const recipients: Array<Recipient> = [
  {
    name: 'Sentry',
    purpose:
      'Tells us when the app throws an error, and shows us enough to reproduce it.',
    receives: [
      'The error itself — its message, its stack trace, and the page you were on when it happened.',
      'Your browser and operating system, and which environment of ours you were using.',
      'A sampled trace of how long a page load, a navigation, or a request took.',
      'A masked replay of the seconds before an error, and only then — see below.',
    ],
    neverReceives: [
      'Anything that identifies you. Nothing in the app tells Sentry who you are, so an error report belongs to no account.',
      'Cookies, request bodies, or authorization headers. These are stripped before the report is sent.',
      'Any value stored under a key that looks like a password, a token, a secret, or an address we could contact you at.',
    ],
    retention: SENTRY_RETENTION,
    lawfulBasis:
      'Our legitimate interest in keeping the app working. An app that cannot see its own errors cannot fix them, and the reports are stripped of anything that names you.',
    policyUrl: 'https://sentry.io/privacy/',
  },
  {
    name: 'PostHog',
    purpose:
      'Counts how many people reach each step of the app, so we know which parts are worth building on.',
    receives: [
      'A random id for your account, and which plan you are on.',
      'One page view per navigation, carrying the shape of the route — /coffees/edit rather than the coffee you edited.',
      'Six events marking the path from visitor to subscriber: signing in, creating a coffee, logging a brew, dialling one in, registering interest, and starting a checkout.',
      'The brewing method, plan, or billing period a step applied to, and which environment of ours you were using.',
    ],
    neverReceives: [
      'Any coffee, brew, roaster, tasting note, or piece of equipment — not its content, and not its id.',
      'Anything that identifies you outside our own system: no address we could contact you at, and no display name.',
      'What you type, click, or see. Session recording and autocapture are turned off at boot, and the URLs sent carry no search terms.',
    ],
    retention: POSTHOG_RETENTION,
    lawfulBasis:
      'Our legitimate interest in understanding how the app is used. What is sent is a random id, a route pattern, and six counted steps — enough to see where people stop, not enough to describe anyone.',
    policyUrl: 'https://posthog.com/privacy',
  },
]
