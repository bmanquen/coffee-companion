# Legitimate interests carries the monitoring vendors, and consent is unanswered

[ADR 0009](0009-analytics-sends-an-id-and-a-funnel-nothing-else.md) fixed what PostHog
may receive and [ADR 0010](0010-a-replay-is-attached-to-an-error-never-to-a-session.md)
fixed what Sentry may record. Neither said why we are allowed to send any of it. That
answer was owed to a user and had never been written anywhere, which is what
`/privacy` now fixes — but a public page is a claim, and the claim has to be decided
here first rather than drafted into prose and discovered later.

The basis we claim, for the two monitoring vendors, is **legitimate interests**.

- **Sentry.** Keeping the app working is the interest, and an app that cannot see its
  own errors cannot fix them. What is sent is narrow by construction: `sendDefaultPii`
  is off, `scrubSentryEvent` strips cookies, bodies, and sensitive headers, and nothing
  calls `Sentry.setUser`, so an error belongs to no account. The replay is the strongest
  part of the case, not the weakest — it exists only where there is already a stack
  trace to explain, which is the distinction 0010 is entirely about.
- **PostHog.** Knowing where people stop is the interest. 0009 already reduced the
  payload to a random id, a route pattern, six counted events, and a Plan. There is no
  recording, no autocapture, no search params, and no contactable identifier. A balancing
  test that starts from that payload is not a close call.

Three other companies receive something, and none of them is a monitoring decision.
Their basis is **performance of a contract** — the user asked for the thing, and the
sending is the thing:

- **Google** is sign-in. There is no password of our own, so proving who you are runs
  through Google or not at all.
- **Stripe** is the payment, and by ADR 0006 the merchant of record. A checkout that
  does not reach Stripe is not a checkout.
- **Resend** delivers the single interest-confirmation email. Registering interest is a
  request to be written to.

They were missing from the first draft of this ADR and of `/privacy`, which claimed the
app sent data to two companies. It sends to five. A page that undercounts its recipients
is worse than no page, so the count is asserted in `privacy.test.ts` rather than left to
prose.

What we rejected:

- **Consent as the basis for analytics.** The stricter reading treats product analytics
  as opt-in regardless of payload. We did not take it, because it would put a gate in
  front of a random id and six counted events while the thing that actually records
  behaviour — the replay — would ride through on a different basis. If analytics ever
  grows past the 0009 allow-list, this line is the first thing that stops being true.
- **Writing the basis onto the page only.** A claim that lives in JSX gets edited by
  whoever is adjusting the copy. It is recorded here so that changing it is a decision.

Consequences to understand before changing anything here:

- **This ADR does not answer the ePrivacy question, and must not be read as if it did.**
  Lawful basis under the GDPR and consent for storing information on a device under the
  ePrivacy Directive are separate questions with separate answers. The Sentry SDK writes
  a `sentryReplaySession` key to browser storage the moment the recorder starts, and
  whether error diagnostics is "strictly necessary" enough to do that without consent has
  not been put to anyone qualified. Issue #124 carries that question and the banner that
  a "yes" would require. Until it closes, `/privacy` describes what happens and claims no
  exemption.
- **Legitimate interests carries a right to object.** Whoever answers #124 owns this too;
  the page has nowhere to object today because there is no mechanism to object with, and
  a banner is the mechanism.
- **The page's retention figures are our dashboard settings, and go stale silently.**
  Sentry keeps errors for 90 days; PostHog keeps events for a year. They live as two
  constants at the top of `apps/web/src/lib/privacy.ts`. Nothing in the repo can notice
  when someone changes a retention setting in a vendor dashboard, so changing one there
  without changing the constant here makes the one sentence on the page that is actively
  false rather than merely incomplete. Two figures are still unstated: Sentry's retention
  for traces and replays, and how long a PostHog person profile survives its events.
  Both are named in #124.
- **The Sentry DPA has not been checked.** Sentry is US-based, so international transfer
  terms apply and someone has to confirm the DPA is executed on our account. Nothing in
  the repo can establish that.
- **Naming the user in Sentry breaks this.** 0010 already says a replay tied to an id is a
  different thing to hold. It is also a different balancing test, and this ADR is written
  against a Sentry that names nobody.
