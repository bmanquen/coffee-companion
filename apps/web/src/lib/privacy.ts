// Developer keeps 30 days; Team keeps 90. "up to 90 days" stays true on both.
// A figure here that drifts from the plan is the one sentence on the page that
// is actively false rather than merely incomplete.
const SENTRY_RETENTION =
  'Sentry keeps errors, traces and replays for up to 90 days, then deletes them.'
const POSTHOG_EVENTS_RETENTION =
  'PostHog keeps events for a year, then deletes them.'

export function posthogPersonRetention(
  personDeleteConfigured: boolean,
): string {
  return personDeleteConfigured
    ? `${POSTHOG_EVENTS_RETENTION} The PostHog profile is deleted when those 30 days end.`
    : `${POSTHOG_EVENTS_RETENTION} A PostHog person profile has no expiry until it is deleted in PostHog.`
}

const CONTRACT_BASIS =
  'Performing the contract you asked us for. Without this the feature you pressed cannot happen at all.'

export const APPLE_RETENTION =
  'Apple keeps its own record of the sign-in under its policy. We keep your name and the address it returned — including a Hide My Email relay — and Apple’s refresh token for as long as the account exists, and for 30 days after you delete it so you can restore it.'

export function normalizePrivacyText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export type Recipient = {
  name: string
  slug: string
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
    slug: 'sentry',
    purpose:
      'Tells us when the app throws an error, and shows us enough to reproduce it.',
    receives: [
      'The error itself — its message, its stack trace, and the page you were on when it happened.',
      'A random id for your account, if you were signed in when it happened.',
      'Your browser and operating system, and which environment of ours you were using.',
      'A sampled trace of how long a page load, a navigation, or a request took.',
      'A masked replay of the seconds before an error, and only then — see below.',
    ],
    neverReceives: [
      'Your name, your address, or anything else that says who you are. The random account id is the only thing we attach that is about you at all.',
      'Cookies, request bodies, or authorization headers. These are stripped from every report before it is sent.',
      'Any extra value we attach to a report under a key that looks like a password, a token, a secret, or an address we could contact you at. This filter covers the values we attach ourselves, not the text of the error message itself — so we keep error messages free of your data at the point they are written.',
    ],
    retention: SENTRY_RETENTION,
    lawfulBasis:
      'Our legitimate interest in keeping the app working. An app that cannot see its own errors cannot fix them, and the reports are stripped of anything that names you.',
    policyUrl: 'https://sentry.io/privacy/',
  },
  {
    name: 'PostHog',
    slug: 'posthog',
    purpose:
      'Counts how many people reach each step of the app, so we know which parts are worth building on.',
    receives: [
      'A random id for your account, and which plan you are on.',
      'One page view per navigation, carrying the shape of the route — /coffees/edit rather than the coffee you edited.',
      'Six events marking the path from visitor to subscriber: signing in, creating a coffee, logging a brew, dialing one in, registering interest, and starting a checkout.',
      'The brewing method, plan, billing period, or place on the page a step applied to, and which environment of ours you were using.',
      'What the PostHog library adds to every event by itself: your browser, operating system, device type, screen size, and the site that referred you.',
      'Your approximate location — country, and often region and city — which PostHog derives from your IP address at its end.',
    ],
    neverReceives: [
      'Any coffee, brew, roaster, tasting note, or piece of equipment — not its content, and not its id.',
      'Anything that identifies you outside our own system: no address we could contact you at, and no display name.',
      'What you type, click, or see. Session recording and autocapture are turned off at boot, and every URL we send is cut short of its query string.',
    ],
    retention: posthogPersonRetention(false),
    lawfulBasis:
      'Our legitimate interest in understanding how the app is used. What is sent is a random id, a route pattern, and six counted steps — enough to see where people stop, not enough to describe anyone.',
    policyUrl: 'https://posthog.com/privacy',
  },
  {
    name: 'Google',
    slug: 'google',
    purpose:
      'Signs you in on the web, iOS, and Android. Coffee Companion has no password of its own.',
    receives: [
      'The fact that you are signing in to Coffee Companion, at the moment you press the button.',
    ],
    neverReceives: [
      'Anything you keep in the app. Sign-in is the whole of the exchange, and it runs on Google, not here.',
      'Any further contact after sign-in. We do not read your mail, your contacts, or your calendar.',
    ],
    retention:
      'Google keeps its own record of the sign-in under its policy. We keep your name, address, and avatar as it returns them, for as long as you have an account.',
    lawfulBasis: CONTRACT_BASIS,
    policyUrl: 'https://policies.google.com/privacy',
  },
  {
    name: 'Apple',
    slug: 'apple',
    purpose:
      'Signs you in on iPhone. Coffee Companion has no password of its own, so Apple is the other way to prove who you are.',
    receives: [
      'The fact that you are signing in to Coffee Companion, at the moment you press the button.',
      'A name and an email the first time you allow them. Later presses do not send them again, and the email may be a Hide My Email relay that Apple forwards.',
    ],
    neverReceives: [
      'Anything you keep in the app. Sign-in is the whole of the exchange, and it runs on Apple, not here.',
      'Any further contact after sign-in. We do not read your mail, your contacts, or your calendar.',
    ],
    retention: APPLE_RETENTION,
    lawfulBasis: CONTRACT_BASIS,
    policyUrl: 'https://www.apple.com/legal/privacy/',
  },
  {
    name: 'Stripe',
    slug: 'stripe',
    purpose:
      'Takes the payment. Stripe is the merchant of record and sells through its Link brand, so the sale is between you and them, and we never hold a card number.',
    receives: [
      'Your name and the address we can contact you at, so it can send a receipt and manage the subscription.',
      'Which plan and billing period you chose.',
      'Your payment details, typed on Stripe’s own checkout page and never on ours.',
    ],
    neverReceives: [
      'Any coffee, brew, roaster, tasting note, or piece of equipment.',
      'Anything at all, unless you start a checkout. Someone who never subscribes is never sent to Stripe.',
    ],
    retention:
      'Stripe keeps payment records for as long as the law requires it to, which is years rather than months.',
    lawfulBasis: CONTRACT_BASIS,
    policyUrl: 'https://stripe.com/privacy',
  },
  {
    name: 'Resend',
    slug: 'resend',
    purpose:
      'Delivers the one email we send, confirming you registered interest in a plan.',
    receives: ['The address we send to, and the first name we greet you by.'],
    neverReceives: [
      'Any coffee, brew, roaster, tasting note, or piece of equipment.',
      'Anything at all unless you register interest. No other email is sent from the app.',
    ],
    retention:
      'Resend keeps the sending record and its content under its own policy, not under a setting of ours.',
    lawfulBasis: CONTRACT_BASIS,
    policyUrl: 'https://resend.com/legal/privacy-policy',
  },
]

// Chrome labels from RecipientSection. A copy edit there must update the
// approved snapshot so an extra sentence cannot pass.
export function appleRegionText(): string {
  const apple = recipients.find((recipient) => recipient.slug === 'apple')
  if (!apple) throw new Error('Apple recipient missing')
  return normalizePrivacyText(
    [
      apple.name,
      apple.purpose,
      'What it receives',
      ...apple.receives,
      'What it never receives',
      ...apple.neverReceives,
      'How long it is kept',
      apple.retention,
      'Why we are allowed to send it',
      apple.lawfulBasis,
      `${apple.name}'s privacy policy`,
    ].join(' '),
  )
}

// Frozen Apple section copy. An intentional edit updates this string.
export const APPROVED_APPLE_REGION_TEXT =
  "Apple Signs you in on iPhone. Coffee Companion has no password of its own, so Apple is the other way to prove who you are. What it receives The fact that you are signing in to Coffee Companion, at the moment you press the button. A name and an email the first time you allow them. Later presses do not send them again, and the email may be a Hide My Email relay that Apple forwards. What it never receives Anything you keep in the app. Sign-in is the whole of the exchange, and it runs on Apple, not here. Any further contact after sign-in. We do not read your mail, your contacts, or your calendar. How long it is kept Apple keeps its own record of the sign-in under its policy. We keep your name and the address it returned — including a Hide My Email relay — and Apple’s refresh token for as long as the account exists, and for 30 days after you delete it so you can restore it. Why we are allowed to send it Performing the contract you asked us for. Without this the feature you pressed cannot happen at all. Apple's privacy policy"
