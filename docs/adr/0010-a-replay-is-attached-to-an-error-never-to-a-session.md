# A replay is attached to an error, never to a session

[ADR 0009](0009-analytics-sends-an-id-and-a-funnel-nothing-else.md) rejected PostHog's
session recording outright — "Recording would capture what a user types" — and left Sentry
to its own decision. This is it. Sentry now records a replay in the browser and attaches it
to a captured error, and that is not a reversal of 0009 because the two features answer
different questions.

PostHog's recording would have been on for every session, kept whether or not anything went
wrong, and read to watch how people use the app. Sentry's exists only when there is a stack
trace to explain, and is read to reproduce one bug. What 0009 refused was recording as a
research tool; this is recording as an attachment to a failure.

What is recorded, and what leaves the browser:

- **Everything, into a buffer; nothing, until an error.** `replaysSessionSampleRate` is `0`
  and `replaysOnErrorSampleRate` is `1`. That pair is Sentry's buffer mode: the SDK keeps a
  short rolling recording in browser memory at all times and uploads it only when an
  exception is captured. An ordinary session ends with the buffer discarded and no request
  made. "Nothing is recorded" is the wrong description; **nothing is sent** is the right
  one.
- **Every text node masked, every input masked, every media element blocked.**
  `maskAllText`, `maskAllInputs`, and `blockAllMedia` are all on. A replay is boxes and
  interactions — the shape of what happened, none of its content. A Coffee name, a
  roaster, a tasting note, and an email address are all rectangles.
- **Masking is the whole defence.** A replay does not pass through `beforeSend`; that hook
  sees errors and transactions, not recordings. `scrubSentryEvent` cleans the error a
  replay is attached to, and it cleans nothing inside the replay itself. Whatever the
  masking flags fail to cover is uploaded.

What we rejected:

- **Session-level replay at any sample rate.** A rate above zero makes the app a recorder
  of ordinary use, which is what 0009 refused. If a product question ever needs that, it is
  a new decision, not a config change.
- **Lazy-loading the integration from a vendor CDN.** Sentry documents a dynamic import for
  replay to keep it out of the main bundle. We import it statically and accept the bundle
  cost: a replay that finishes loading after the error it was meant to explain is worth
  nothing.
- **Unmasking anything to make a replay easier to read.** `unmask`, `unblock`, and
  `maskTextSelector` exemptions are how a masked replay leaks. The flags are produced by
  the shared options builder and asserted in `apps/web/src/lib/sentry.test.ts` precisely so
  that loosening one has to be a deliberate edit to a tested value.

Consequences to understand before changing anything here:

- **`blockAllMedia` blocks media elements, not CSS.** It covers `<img>`, `<video>`,
  `<audio>`, and friends. A picture painted as a CSS `background-image` is not a media
  element and is not blocked. There is no `background-image` in `apps/web/src` today; if
  one ever renders user content — an avatar, a Coffee bag photo — it needs an explicit
  `.sentry-block` class, or this ADR is quietly untrue.
- **Nothing names the user, and that is what keeps a replay anonymous.** No code calls
  `Sentry.setUser`, so a replay today is masked interaction timing belonging to no
  account. ADR 0009 left naming the user in Sentry as its own decision; whoever makes
  that decision is also making this one. A replay tied to an id stops being anonymous
  behavioural data and becomes a recording of an identified person — a different thing
  to hold, and a different thing to answer for if asked. Decide it as that, not as a
  one-line addition to `scrubSentryEvent`.
- **No DSN, no recorder.** The replay integration is registered inside the existing
  `sentryEnabled(dsn)` guard in `apps/web/src/instrument.client.ts`, so local development
  and CI never construct it.
- **The browser only.** Replay is a browser feature. `instrument.server.ts` is untouched,
  and the API package's rule of never importing Sentry still holds.
- **What is tested is the options, not the recording.** `instrument.client.ts` is wiring and
  stays excluded from coverage; the tests assert what the SDK is handed. That a replay
  actually arrives masked is only ever confirmed against a real DSN.
