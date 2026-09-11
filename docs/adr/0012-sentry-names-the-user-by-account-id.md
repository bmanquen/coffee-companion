# Sentry names the user by account id, and a replay now belongs to someone

[ADR 0009](0009-analytics-sends-an-id-and-a-funnel-nothing-else.md) left this open —
"Sentry is a separate decision… when it does, it is the same id and nothing else, and
that is its own ADR" — and [ADR 0010](0010-a-replay-is-attached-to-an-error-never-to-a-session.md)
warned that whoever made it was making a second decision at the same time. This is both.

Sentry now receives the signed-in user's account id on a browser error. It is the same
random id PostHog already receives, and it is the only thing about a person that reaches
Sentry at all.

What that buys is the question an error report could not answer before: whether a stack
trace is one person hitting one broken state or everybody hitting a broken deploy. Two
hundred events from one account is a bug in that account's data. Two hundred events from
two hundred accounts is an outage. Without an id the two are the same report.

What is sent, and what is not:

- **The id, and nothing else.** `sentryUserFrom` maps a session to `{ id }` and is the
  only producer of a Sentry user. `scrubSentryEvent` independently reduces `event.user` to
  its id, so a `username`, an `email`, or an `ip_address` arriving from the SDK's own
  defaults is dropped on the way out. Two mechanisms, because the first is a convention
  and the second is enforcement.
- **`sendDefaultPii` stays off.** It is what would otherwise attach an IP address to the
  user object without anyone asking.
- **The authenticated layout is the only place it is set.** Keyed on the id, once the
  route context's session has resolved. The marketing layout never sets a user, so an
  error on a public page belongs to nobody.
- **Sign-out clears it, and waits.** The shared sign-out helper introduced by 0009 calls
  `Sentry.setUser(null)` and awaits it before signing out and navigating. The browser
  seam is behind a dynamic import; not awaiting it would let the clear land after the next
  page had already started, which on a shared device attributes the next person's error to
  the previous one.

What we rejected:

- **The email, the name, or the avatar.** All three are on the session object and all
  three are one property away in the helper. None of them buys anything the id does not:
  grouping by account needs an opaque key, not a contactable one. A support reply that
  needs an address looks it up in our own database against the id.
- **Setting the user on the server.** The server-side half is its own ticket, and the
  server's session is resolved per request rather than held. It gets the same id and the
  same rule, or it gets nothing.
- **Naming the user only when a replay is off.** That would make the id conditional on a
  sampling decision, which is not a privacy boundary anyone could describe on a page.

Consequences to understand before changing anything here:

- **A replay is now a recording of an identified person.** 0010 said this plainly and
  reserved it: "A replay tied to an id stops being anonymous behavioural data and becomes
  a recording of an identified person — a different thing to hold, and a different thing
  to answer for if asked." That is now what we hold. The masking is unchanged and is still
  the whole defence: `maskAllText`, `maskAllInputs`, and `blockAllMedia` on, no `unmask`
  exemptions. What changed is that a replay is attributable, so loosening any of those
  flags is now a larger decision than 0010 was weighing.
- **The 0011 balancing test is rewritten, and still holds.**
  [ADR 0011](0011-legitimate-interests-carries-the-monitoring-vendors-and-consent-is-unanswered.md)
  claimed legitimate interests for Sentry on the grounds that "nothing calls
  `Sentry.setUser`, so an error belongs to no account." That sentence is no longer true.
  The basis does not change: the interest is the same, the payload grows by one opaque id
  that is useless outside our own database, and the id is what makes the difference
  between fixing one account's data and rolling back a deploy. It is a closer call than it
  was, and it is recorded as one. Whoever answers #124 is now weighing a monitoring
  vendor that can tell two users apart.
- **`/privacy` has to say so.** The page's Sentry section lists the id under what Sentry
  receives, and no longer claims nothing in the app tells Sentry who you are. The claim is
  asserted in `privacy.test.ts`, per 0011's rule that a claim on that page is pinned by a
  test rather than left to prose.
- **The right to object now has something to object to.** Until #124 there is no
  mechanism, which was already true of the replay. The id does not create the gap; it
  widens what falls into it.
