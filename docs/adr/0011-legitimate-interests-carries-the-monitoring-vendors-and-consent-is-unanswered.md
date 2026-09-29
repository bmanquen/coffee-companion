# Legitimate interests carries the monitoring vendors, and the device stores only the session you asked for

[ADR 0009](0009-analytics-sends-an-id-and-a-funnel-nothing-else.md) fixed what PostHog
may receive and [ADR 0010](0010-a-replay-is-attached-to-an-error-never-to-a-session.md)
fixed what Sentry may record. Neither said why we are allowed to send any of it. That
answer was owed to a user and had never been written anywhere, which is what
`/privacy` now fixes — but a public page is a claim, and the claim has to be decided
here first rather than drafted into prose and discovered later.

The basis we claim, for the two monitoring vendors, is **legitimate interests**.

- **Sentry.** Keeping the app working is the interest, and an app that cannot see its
  own errors cannot fix them. What is sent is narrow by construction: `sendDefaultPii`
  is off, `scrubSentryEvent` strips cookies, bodies, and sensitive headers, and the only
  thing naming a user is the account id that
  [ADR 0012](0012-sentry-names-the-user-by-account-id.md) allows — an opaque key, useless
  outside our own database, and cleared on sign-out. The replay is the strongest
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

Lawful basis under the GDPR and consent for storing information on a device under the
ePrivacy Directive are separate questions. The second one is now answered: **we write
no non-essential information on the device, so Article 5(3) never asks for a consent
banner.**

- **The first-party storage that is strictly necessary.** The exemption is
  [Article 29 Working Party Opinion 04/2012 (WP194)](https://ec.europa.eu/justice/article-29/documentation/opinion-recommendation/files/2012/wp194_en.pdf):
  storage that is strictly necessary for a service the user explicitly requested.
  better-auth's session cookie (`better-auth.session_token`) exists because the user
  pressed Sign in. During Google sign-in the library also sets a short-lived OAuth
  state cookie so the callback can finish; that is the same request. TanStack Router
  may write one `tanstack_router_reload:<module>` key to sessionStorage if a lazy
  chunk 404s after a deploy — it reloads once so the user gets the page they asked
  for, and it does not loop. We do not write that key ourselves. It is strictly
  necessary for the page they requested.
- **PostHog runs storage-free.** `persistence` is `'memory'` (posthog-js 1.428.11).
  Distinct id, session id, window id, flags, and super-properties stay in RAM for this
  page. A reload starts a new anonymous session; the authenticated layout identifies
  the account id on boot even if the plan query is still pending or has failed, and
  attaches the plan when it arrives, so events still stitch to the person. Surveys and
  recording were already off. Opt-out state is only written if we call `opt_out` /
  `opt_in` — we never do. The toolbar only writes if someone opens it.
- **Sentry Replay runs storage-free.** `stickySession` is `false`, so the SDK never
  writes `sentryReplaySession`. The buffer 0010 describes stays in memory; an error
  still uploads the replay. Browser tracing keeps the previous-trace link in memory
  (the SDK default). We do not install the offline transport, which would have used
  IndexedDB.

Planet49 (C-673/17) and EDPB Guidelines 2/2023 — the primary source for the
technical scope of Article 5(3) — put cookies, localStorage, sessionStorage,
IndexedDB, and the rest of device storage in the same bucket. We stay out of that
bucket except for the session. A banner would be the answer if we started writing
anything else.

What we rejected:

- **Consent as the basis for analytics.** The stricter reading treats product analytics
  as opt-in regardless of payload. We did not take it, because it would put a gate in
  front of a random id and six counted events while the thing that actually records
  behaviour — the replay — would ride through on a different basis. If analytics ever
  grows past the 0009 allow-list, this line is the first thing that stops being true.
- **A consent banner for device storage.** The first draft of this ADR left ePrivacy
  unanswered and said a banner was the mechanism if the answer was yes. The answer is
  no: turn the writes off instead of asking permission to keep them.
- **Writing the basis onto the page only.** A claim that lives in JSX gets edited by
  whoever is adjusting the copy. It is recorded here so that changing it is a decision.

Consequences to understand before changing anything here:

- **Adding a cookie, a localStorage key, or any other device write reopens ePrivacy.**
  Theme prefs, a flags cache, a sticky replay session, PostHog persistence that is not
  `'memory'`, an offline Sentry transport, or shipping TanStack Devtools in the
  production bundle would all need a new decision — and likely a banner. The options
  tests in `analytics.test.ts` and `sentry.test.ts` fail if the two vendor levers
  move. Devtools render only when `import.meta.env.DEV` is true.
- **Legitimate interests still carries a right to object.** Storage-free is not a
  mechanism to object with. The page has nowhere to object today; that remains open
  and is not solved here.
- **The page's retention figures are our dashboard settings, and go stale silently.**
  Sentry keeps errors, traces and replays for up to 90 days; PostHog keeps events
  for a year and person profiles until they are deleted. They live as two
  constants at the top of `apps/web/src/lib/privacy.ts`. Nothing in the repo can notice
  when someone changes a retention setting in a vendor dashboard, so changing one there
  without changing the constant here makes the one sentence on the page that is actively
  false rather than merely incomplete. Moving to Sentry's Business plan (which keeps
  sampled traces up to 13 months) or a paid PostHog plan (events kept 7 years) means
  updating these figures
  ([Sentry retention](https://docs.sentry.io/security-legal-pii/security/data-retention-periods/),
  [PostHog persons](https://posthog.com/docs/data/persons)).
- **The Sentry DPA was accepted in the Sentry org settings (Sep 28, 2026).**
  Issue [#124](https://github.com/bmanquen/coffee-companion/issues/124) records
  the acceptance; the org's audit log is the source. EU/UK transfers to the US
  rely on the EU-U.S. Data Privacy Framework (plus the UK and Swiss extensions),
  with the 2021 EU Standard Contractual Clauses and UK addendum as the fallback
  ([Sentry DPA, Schedule 3](https://sentry.io/legal/dpa/)).
- **Naming the user in Sentry reopened the balancing test, and it was reopened
  deliberately.** This ADR was first written against a Sentry that named nobody.
  [ADR 0012](0012-sentry-names-the-user-by-account-id.md) added the account id and
  reweighed the balancing test there: the interest is unchanged, the payload grows by one
  opaque id, and the replay 0010 describes now belongs to an identifiable account. The
  basis holds, but it is a closer call than the first draft of this ADR was making.
