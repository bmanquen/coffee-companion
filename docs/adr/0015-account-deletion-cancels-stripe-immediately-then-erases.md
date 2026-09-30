# Account deletion cancels Stripe immediately, then erases

A signed-in user can delete their account. The 0008 rule for voluntary
cancellation is that access lasts until the period already paid for. Account
deletion is a different ending: there is no account left to serve, so a live
Subscription is cancelled at Stripe first, immediately, and only then is the
user row removed. If that cancel fails, deletion stops — otherwise Stripe would
keep billing a customer we no longer have a record of. Stripe stays the source
of truth (ADR-0008).

Erasure after that: every user-owned row cascades from `user.id`; verification
rows keyed by the account's email are deleted explicitly; the PostHog person
for that account id is deleted through a seam so the API package never imports
PostHog (ADR-0014). Sentry is not asked to erase — it holds only the account id
for up to 90 days (ADR-0010, ADR-0012). Resend keeps its sending record under
its own policy.

better-auth's `deleteUser` is not the mechanism. It is built for a password or
a deletion-verification email, and this app has neither: sign-in is Google, and
confirmation is the in-app dialog. It also does not cancel Stripe, drop
verification rows, or erase a PostHog person. The authenticated tRPC mutation
is the procedure that does.

What we rejected:

- **Refuse deletion until the user cancels in the billing portal.** Safer for
  billing, worse for Art. 17: a subscriber who wants to leave would have to
  complete two flows, and a cancel still pending at period end would keep a live
  Subscription attached to a deleted account. Immediate cancel-then-delete is
  the one action.
- **Cancel at period end.** That is 0008's voluntary-cancellation rule, and it
  leaves Stripe holding a Subscription whose account is gone.
- **better-auth `deleteUser` with freshness disabled, or a Resend deletion
  email.** Either reopens a product decision the account page already answered,
  or adds an email this app otherwise sends only for Interest.

Consequences to understand before changing anything here:

- **A deleted subscriber's paid period is forfeited.** Accepted: there is no
  account to keep serving.
- **PostHog erasure runs after the row is gone.** A PostHog outage is reported,
  not a reason to keep the account. Manual follow-up if the report fires.
- **The personal API key and project id are required to actually reach PostHog.**
  Missing them is the local/CI no-op, the same as a missing capture key.
