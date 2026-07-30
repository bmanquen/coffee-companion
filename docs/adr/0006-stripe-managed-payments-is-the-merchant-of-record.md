# Stripe Managed Payments is the merchant of record

Coffee Companion sells Subscriptions worldwide from a US entity, and selling a digital
service to consumers abroad creates indirect-tax obligations from the first transaction
rather than at some comfortable threshold — the EU's non-Union OSS scheme has no
registration threshold at all, and the UK, Norway, Switzerland, Australia, Japan, Canada
and the US states each impose their own. We use Stripe Managed Payments, which makes
Stripe the merchant of record: it calculates, collects and remits sales tax, VAT and GST
in more than eighty countries, so this project registers nowhere and files nothing. It
absorbs fraud, disputes and transaction-level support along with it. The price is 3.5% of
every transaction on top of standard Stripe fees.

What we rejected, and why the rejections matter more than the choice:

- **Stripe Tax with our own registrations.** Stripe Tax calculates tax and monitors
  thresholds but explicitly does not register or file on your behalf, so this option is
  not "the same thing, cheaper" — it is the same integration plus a permanent compliance
  job. A realistic stack of registrations and filing services runs $1,500–4,000 a year
  before counting hours, which puts the crossover with a 3.5% fee somewhere around a
  thousand paying subscribers. Below that, buying our way out is cheaper in cash and far
  cheaper in attention.
- **A third-party merchant of record** (Paddle, Lemon Squeezy, Polar) charges a
  comparable or higher take rate and moves Subscription state outside Stripe, so it costs
  more and integrates worse.
- **Selling to the US only** would sidestep the problem entirely and is the cheapest
  option on paper, but a coffee-nerd audience is heavily European and Australian. This
  defends a fee by switching off the customers who would pay it.

Consequences to understand before changing anything here:

- **This is lock-in, not a provider choice.** Subscribers' payment credentials belong to
  Link, so leaving Managed Payments means re-collecting payment details from every paying
  subscriber — a migration that loses customers rather than one that costs engineering
  time. The crossover arithmetic above is the condition to reopen this at, and we are
  nowhere near it.
- **The take rate is why the pricing toggle defaults to annual.** Standard fees plus 3.5%
  costs 12.4% of Pro monthly and 7.1% of Pro annual; the 30¢ fixed fee is what makes the
  monthly price expensive. Annual additionally removes most dunning and most involuntary
  churn.
- **Prices are tax-exclusive.** Tax is added at checkout, so margin does not depend on
  where a subscriber lives. Tax-inclusive pricing would surrender about 17% of revenue in
  the EU and make the effective take rate a function of geography — unaffordable at
  $4.99.
- **Link is the brand the customer transacts with.** The statement descriptor reads
  `LINK.COM*`, receipts and subscription emails come from Link, checkout says "Sold
  through Link", and customers can manage Subscriptions at link.com. The pricing FAQ
  discloses this on purpose: continued eligibility depends on a low dispute rate, and an
  unrecognised descriptor is a leading cause of disputes.
- **We control the entitlement, not the money.** Stripe owns disputes end to end and may
  refund without our approval if a support escalation goes unanswered for 48 hours, so
  revoking access is our side of a decision someone else made (see ADR-0007).
- **Constraints we have inherited.** Digital goods only, each carrying an eligible tax
  code. No Connect, no Elements or embedded components, and Subscriptions must be created
  through Checkout or Payment Links — which is why checkout is a redirect and not an
  in-app form. No custom domain on the checkout page.
- **The app's own Plan identifiers stay the only vocabulary outside the billing module.**
  Price IDs and the provider live server-side; `apps/web/src/lib/plans.ts` remains free of
  payment-provider concepts, as its header requires.
