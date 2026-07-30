# Three events Seal a lapsed subscriber, and they are not one event

Losing a paid Plan is a Shelf shrinking from the whole library to five, so ADR-0004
already says what happens to the Brews that fall off it: they Seal. What ADR-0004 never
considered is a former subscriber, and billing supplies three different ways to become
one. They resolve differently on purpose:

- **Voluntary cancellation Seals at the end of the period already paid for.** Paid
  through the 14th, Sealed on the 15th.
- **A failed renewal charge does not Seal.** Access holds through Stripe's retry window
  and Seals only once Stripe gives up on the Subscription.
- **A dispute Seals immediately**, as does a full refund of the current period. A partial
  refund, or a refund of an older invoice, Seals nothing.

The simplification we rejected is the obvious one: _not paid means Sealed_, a single
status check. It is wrong because a declined card is the most common way to stop being
active and it is rarely a decision — a card expires, a bank declines, and the retry two
days later succeeds. Under that rule an annual subscriber with two hundred Coffees loses
years of dial-ins over a bank message and gets them back on Thursday. ADR-0006 makes that
worse rather than merely sad: the complaint goes to Link rather than to us, and an
escalation we do not answer within 48 hours lets Stripe refund without asking. The flicker
costs real revenue and, through the dispute rate, our eligibility.

Consequences to understand before changing anything here:

- **Each rule maps to exactly one webhook.** Three rules do not mean three judgement
  calls: cancellation at period end, exhausted retries, and a dispute or full refund each
  arrive as a distinct event. Collapsing them into one status check is what introduces
  ambiguity, not what removes it.
- **Sealing writes; unsealing does not.** While a Plan is paid, seal stamps are ignored
  entirely, so recovering from a declined card or resubscribing costs no writes at all.
  Only the shrinking of a Shelf writes.
- **Sealed by lapse is not a second kind of Sealed.** ADR-0004's "permanent on Free" means
  that brewing a Coffee again never reopens its old Brews — paying does. A returning
  subscriber gets everything back, and there is one stamp, not two.
- **Goodwill belongs in Grants, not in these rules.** When we want someone to keep access
  after a refund we did not authorise, that is a Grant carrying its reason — not a fourth
  exception here.
- **A determined non-payer gets Stripe's retry window for free.** Accepted knowingly: the
  alternative punishes far more expired cards than freeloaders.
- **The pricing FAQ states the cancellation rule.** A promise about someone's own history
  cannot live only in a webhook handler.
