# Analytics sends an id and a funnel, nothing else

Product analytics is PostHog's browser SDK, and what it is allowed to send is decided
here once so that the next event does not reopen the question. The line is the one Sentry
already draws: a user is a random id, never an email, a name, or an avatar. Everything
else is the shape of the app, not the content of anyone's brewing log.

What leaves the app:

- **One page view per resolved navigation**, carrying the matched route pattern in both
  `$pathname` and `$current_url`. A Brew's edit page is one route in PostHog, not one per
  id, and no search params travel. The pathname itself is sent only when nothing matched.
- **One person per signed-in user, keyed on the better-auth user id**, with the current
  Plan as the only person property. Person profiles are created for identified users
  only, so an anonymous visitor is a device until they sign in, and their earlier page
  views then stitch to the person.
- **Six named events** — the brewing funnel from visitor to paying: `sign_in_started`,
  `coffee_created`, `brew_logged`, `brew_dialed_in`, `interest_registered`,
  `checkout_started`. A property names a Plan, a billing period, a Brewing Method, or
  where sign-in started. Never a Coffee, a Brew, a roaster, a note, or a piece of
  equipment, and never an id of any of them.
- **The environment name**, the same one Sentry receives.

What we rejected:

- **Autocapture, session recording, surveys, and the SDK's own page-view capture.**
  Autocapture would ship button text and form labels, which in this app are Coffee names
  and roasters. Recording would capture what a user types. The SDK's page view would
  send resolved ids and the query string. All four are off at boot, in one options object.
- **Identifying by email, or sending a display name so the PostHog UI reads better.** The
  maintainer reading a funnel does not need to know who anyone is, and an analytics
  vendor is one more place a breach could name a user.
- **Server-side capture or a proxy.** The API package never imports PostHog. Every event
  is fired from the component that owns the action, after the mutation resolves where
  there is one, so a failed save is not a funnel step.
- **A consent banner.** Deferred, not refused. With recording and autocapture off the
  payload is a random id, route patterns, and six events. If the app ever serves traffic
  under a consent regime, the answer is to gate the boot behind consent, not to change
  what is sent.

Consequences to understand before changing anything here:

- **The event union is the whole allow-list.** `Events` in `apps/web/src/lib/analytics.ts`
  is a closed type with typed properties. Adding an event means adding it there, and a
  misspelled name fails the typecheck. A new property that names a Coffee, a Brew, or a
  note contradicts this ADR.
- **Components import the facade, never `posthog-js`.** The vendor SDK is injected at
  boot in `apps/web/src/analytics.client.ts`, which is wiring and excluded from coverage.
  Tests hand the facade a fake client, or mock the facade and assert what an event was
  given. Importing the SDK from a component makes that impossible.
- **No key means no client.** A missing or blank `VITE_POSTHOG_KEY` leaves the facade a
  no-op, which is how local development and CI run. The facade is also a no-op wherever
  there is no `window`, so server rendering never reaches PostHog.
- **Reset runs on sign-out, before the session ends.** Both navigation components call
  one shared sign-out helper for this reason. A second path to sign-out that skips it
  attributes the next person on a shared device to the previous one.
- **The marketing layout never identifies.** Identify runs once in the authenticated
  layout, keyed on the user id and Plan, so it fires once per user rather than once per
  navigation.
- **Sentry is a separate decision.** Sentry does not yet name the user; when it does, it
  is the same id and nothing else, and that is its own ADR.
