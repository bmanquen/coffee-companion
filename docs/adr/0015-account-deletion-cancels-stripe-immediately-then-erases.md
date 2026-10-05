# Account deletion cancels Stripe immediately, then holds data for 30 days

A signed-in user can delete their account. The 0008 rule for voluntary
cancellation is that access lasts until the period already paid for. Account
deletion is a different ending: a live Subscription is cancelled at Stripe
first, immediately, and only then is the account marked deleted. If that cancel
fails, deletion stops — otherwise Stripe would keep billing a customer whose
account is gone. Stripe stays the source of truth (ADR-0008). Unused prepaid
time is forfeited: there is no proration, credit, or refund.

The account is then recoverable for 30 days. The user row stays (coffees, brews,
and the rest cascade off it), and that email's verification rows stay. Sessions
end. A pending account is not a live account: signed-in procedures refuse it,
and signing in during the window offers restore. Restore does not call Stripe.
The cancelled Subscription stays cancelled; a new Subscription is a later
Checkout. After 30 days the rows are hard-deleted, including the explicit
verification-row delete, and the PostHog person for that account id is deleted
through a seam so the API package never imports PostHog (ADR-0014). If that
call fails, the account id is kept until a later purge succeeds. Sentry is
not asked to erase — it holds only the account id for up to 90 days (ADR-0010,
ADR-0012). Resend keeps its sending record under its own policy.

better-auth's `deleteUser` is not the mechanism. It is built for a password or
a deletion-verification email, and this app has neither: sign-in is Google, and
confirmation is the in-app dialog. It also does not cancel Stripe, hold a
restore window, or erase a PostHog person. The authenticated tRPC mutation is
the procedure that marks the account deleted; a scheduled POST to
`/api/purge-deleted-accounts` is what erases after 30 days. The repo has no
other job runner — CI is GitHub Actions, and Railway health checks are
dashboard-configured HTTP — so purge is the same shape: an HTTP endpoint with a
shared secret, hit daily by GitHub Actions (or Railway Cron).

What we rejected:

- **Refuse deletion until the user cancels in the billing portal.** Safer for
  billing, worse for Art. 17: a subscriber who wants to leave would have to
  complete two flows, and a cancel still pending at period end would keep a live
  Subscription attached to a deleted account. Immediate cancel-then-hold is
  the one action.
- **Cancel at period end.** That is 0008's voluntary-cancellation rule, and it
  leaves Stripe holding a Subscription whose account is gone.
- **Hard-delete on the same request.** That is what shipped in #149. Recovering
  a mistaken delete needs the row to still be there.
- **Restart the Subscription on restore.** Stripe cannot restart a canceled
  Subscription. A new one is Checkout, later, not part of restore.
- **better-auth `deleteUser` with freshness disabled, or a Resend deletion
  email.** Either reopens a product decision the account page already answered,
  or adds an email this app otherwise sends only for Interest.

Consequences to understand before changing anything here:

- **A deleted subscriber's paid period is forfeited.** Accepted: restore does
  not put billing back.
- **A stored Stripe customer without billing configured refuses deletion.**
  Missing `STRIPE_SECRET_KEY` is not a skip — otherwise a live Subscription
  keeps billing a customer whose account we have marked deleted.
- **Open Checkout Sessions are expired before Subscriptions are cancelled.**
  A session left open can be paid after the account is gone. A session that
  completes in the list-to-expire window is not a reason to stop — the
  Subscription it created is cancelled on the next step.
- **Every Stripe list page is read.** A live Subscription or open Checkout
  past the first hundred is still cancelled or expired.
- **PostHog erasure runs when the 30 days end, after the row is gone.** A
  PostHog outage is reported, and the account id is kept in
  `pending_person_erasure` until a later purge confirms the person delete. A
  person delete that already ran does not come back.
- **The personal API key and project id are required to actually reach PostHog.**
  Missing them is the local/CI no-op, the same as a missing capture key. The
  skip is logged and reported so it is not silent; the profile then has no
  expiry until it is deleted in PostHog.
