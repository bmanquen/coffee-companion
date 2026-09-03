# Stripe's Subscription status is how a paid Plan ends

Supersedes ADR-0007, which got the rules right and the mechanism wrong.

The rules stand. Voluntary cancellation Seals at the end of the period already paid for.
A failed renewal charge does not Seal, and access holds through Stripe's retry window. A
dispute Seals. What ADR-0007 also said — that each rule maps to exactly one webhook, and
that collapsing them into one status check is what introduces ambiguity — is not true of
the billing we actually bought. Under ADR-0006 Stripe is the merchant of record, and
every one of these endings reaches us as a single column changing:

- Cancellation at period end moves `status` to `canceled` when the period runs out.
- Exhausted retries move `status` to `canceled` — Stripe gives up after up to eight
  attempts, on a schedule configured in the Dashboard.
- A dispute moves `status` to `canceled`, once **Manage disputed payments** is set to
  cancel immediately. Left at its default, a disputed Subscription keeps cycling.
- A Link data deletion request cancels the Subscription too — an ending ADR-0007 never
  enumerated, which this design handles without having been told about it.

`@better-auth/stripe` already mirrors that column from `customer.subscription.*`, so
reading it is the whole implementation. The app writes no billing state.

What we rejected:

- **A webhook handler for the rules that are not status changes.** Only one rule is left
  out by reading `status`: a full refund of the current period. Keeping a handler for it
  means owning an endpoint, signature verification, redelivery and idempotency for a
  single rule — and it is the rule below that we no longer want.
- **A lapse table, or a derived column recording when a Plan ended.** A second opinion
  about billing is a thing that can disagree with the first. Stripe decides retry
  schedules, when a cancellation takes effect and when to give up; copying those decisions
  into our tables means maintaining a state machine whose transitions someone else
  controls. There is also nothing to cache, because Sealing is decided on the read path.
- **"Not paid means Sealed."** Still rejected, for exactly ADR-0007's reason, and this
  ADR is not the simplification it warned about. `past_due` is a paid status here: a card
  that expires and clears on Thursday costs a subscriber nothing.

Consequences to understand before changing anything here:

- **`paidStatuses` is the rule, and `past_due` being in it is the declined-renewal rule.**
  `active`, `trialing`, `past_due` — one list, in `packages/api/src/lib/allowance.ts`.
  Removing `past_due` from it reinstates the flicker ADR-0007 exists to prevent.
- **The dispute rule is configuration, not code.** Step 6 of
  `docs/runbooks/stripe-managed-payments.md`. It fires when the dispute is opened rather
  than lost, cannot be undone, and covers only full-amount card disputes — a withdrawn
  dispute wants a Grant, not a code change.
- **A full refund on its own Seals nothing.** This reverses ADR-0007. Refunds never touch
  `subscription.status`, and Sealing on one would make a Grant the mandatory follow-up to
  every goodwill refund — which is ADR-0007's own "goodwill belongs in Grants" argument
  pointed at the rule that broke it. The refund that should end a Plan is one issued while
  cancelling, and that sets `status` by the cancellation path already.
- **A failing renewal is reported, not inferred.** `plan.current` returns
  `renewalFailing` alongside the Plan rather than folded into it, because a Grant can be
  carrying the Plan while the card is the one thing the user can still put right. The
  notice points at account settings, whose **Manage subscription** action opens Stripe's
  billing portal for that customer. The app no longer links to link.com, though a customer
  who finds it there can still manage the Subscription that way (ADR-0006).
- **Sealing writes; unsealing does not.** While a Plan is paid, seal stamps are ignored
  entirely, so recovering from a declined card or resubscribing costs no writes at all.
  Only the shrinking of a Shelf writes.
- **Sealed by lapse is not a second kind of Sealed.** ADR-0004's "permanent on Free" means
  that brewing a Coffee again never reopens its old Brews — paying does. A returning
  subscriber gets everything back, and there is one stamp, not two.
- **A determined non-payer gets Stripe's retry window for free.** Accepted knowingly: the
  alternative punishes far more expired cards than freeloaders.
- **The pricing FAQ states the cancellation rule.** A promise about someone's own history
  cannot live only in server code.
- **Reopening this is cheap.** An ending Stripe's `status` does not carry is the condition
  to revisit at. Because Sealing is a read-path decision, changing the rule needs no
  backfill and no migration — only the list above.
