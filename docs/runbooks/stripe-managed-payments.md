# Setting up Stripe Managed Payments

Everything here is done by a human in the Stripe Dashboard, once per Stripe account
(so: once for test mode, once for live). None of it can be scripted from this repo, and
the app will not sell anything until all of it is done. The reasoning behind the choice
is ADR-0006; this is only the sequence.

Work through it in test mode first and keep the four values it produces — they are what
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO_MONTHLY` and
`STRIPE_PRICE_PRO_ANNUAL` hold. The server refuses to start if any of them is missing or
malformed, and runs with billing switched off entirely if `STRIPE_SECRET_KEY` is unset.

Going live is this whole sequence a second time, not a key swap. Test and live are
separate worlds: a test-mode `price_…` does not exist in live mode, so all four values
change together, and steps 1, 3 and 4 have to be redone before there is anything to point
at.

## 1. Activate Managed Payments

Dashboard → **Settings → Payments → Managed Payments**, and accept its terms. Until this
is done, a Checkout Session that asks for Managed Payments is rejected rather than
quietly falling back to us being the merchant of record — which is the failure we want,
because a silent fallback would mean collecting tax we are not registered to remit.

Managed Payments is digital goods only. It does not support Connect, Elements or any
embedded component, and Subscriptions have to be created through Checkout or Payment
Links — which is why buying is a redirect away from the app and not a form inside it.

## 2. Know which API version we speak

Two versions matter and they are not the same thing.

**What we send.** `packages/api/src/lib/billing.ts` passes no `apiVersion`, so the
installed `stripe` package's own default applies — `2026-07-29.dahlia` in stripe@22.4.0.
Leaving it unpinned is deliberate: the SDK's types are generated for exactly its default
version, and an `apiVersion` string written here is free to drift away from the types
sitting next to it. Upgrade the package to move the version; don't pin a newer string
against older types.

**What we receive.** Webhook events are rendered in the version set on the endpoint
itself, chosen when you create it in step 5. Set it to the version the SDK speaks —
`2026-07-29.dahlia` — rather than whatever the account happens to default to. A version
older or newer than the SDK is allowed to move fields the handlers read: basil moved
`current_period_start` off the Subscription and onto its items, and that is exactly the
field the subscription handler wants.

Managed Payments itself only needs `2025-03-31.basil` or later, so the feature never
constrains this. What does is `@better-auth/stripe`, whose peer range gates which SDK
majors are installable — `^18 || ^19 || ^20 || ^21 || ^22` as of 1.6.5. Check it before
bumping the SDK past a major.

## 3. Create the Pro prices

Dashboard → **Product catalogue** → create a **Pro** product, then add two recurring
prices on it:

| Price | Amount | Interval |
| --- | --- | --- |
| `STRIPE_PRICE_PRO_MONTHLY` | $4.99 | monthly |
| `STRIPE_PRICE_PRO_ANNUAL` | $44.99 | yearly |

Both must have **tax behaviour: exclusive**. Tax is added at checkout on top of the
advertised price (ADR-0006) — inclusive pricing would make margin a function of where the
subscriber lives, and the pricing page says "excluding any tax" in as many words.

Tax behaviour cannot be changed after a price is created. If you pick the wrong one,
create a replacement price and point the environment variable at it.

Copy each price's `price_…` identifier. The product's `prod_…` identifier is not what the
app wants, and the startup check rejects it by name.

## 4. Assign a tax code to the product

On the Pro product, set a **Product tax code**. The Dashboard's picker labels the usable
ones **Eligible for Managed Payments**, and only those are accepted — a product carrying
any other code cannot be sold this way. Pick from that list by what Pro actually is: a
consumer subscription to a hosted service, not business-use software. The code decides the
rate a subscriber is charged, so getting it wrong is a tax error rather than a cosmetic
one.

## 5. Configure the webhook destination

Dashboard → **Workbench → Webhooks** → **Create an event destination**. Stripe calls the
whole thing an event destination now; a webhook endpoint is one type of destination, and
it is the type we want.

1. Events from: **Your account**. Not Connected accounts — Managed Payments does not
   support Connect at all.
2. API version: see below.
3. Event types, at least these four:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Destination type: **Webhook endpoint**.
5. Endpoint URL: `https://<your-host>/api/auth/stripe/webhook`. The `/api/auth` prefix is
   where the auth handler is mounted; the rest is the Stripe plugin's own route.
6. Name (required) and description (optional). Nothing reads either — they label the row
   in Workbench and title the mail Stripe sends when a destination starts failing, which
   is the only moment anyone reads them, so name the environment rather than the app:
   `Coffee Companion — production` and `Coffee Companion — staging`, not two rows both
   called "webhook". A description worth writing says what breaks if it stops:
   "Subscription purchases and Plan changes. If this fails, buyers stay on Free."

Then reveal the destination's **signing secret** (`whsec_…`) and put it in
`STRIPE_WEBHOOK_SECRET`.

The webhook is the source of truth for a purchase, not the browser returning from
Checkout — a buyer may close the tab and never come back, and they are still on Pro.
Delivery is at least once, so the handlers are idempotent by design.

### One destination per deployed URL

A destination points at exactly one endpoint, so environments cannot share one.

| Environment | Destination | `STRIPE_WEBHOOK_SECRET` comes from |
| --- | --- | --- |
| localhost | none | the running `stripe listen` |
| staging | one, in test mode | that destination |
| production | one, in live mode | that destination |

Each destination has its own signing secret, and a secret from the wrong one does not
fail loudly: verification rejects the event, the app keeps running, and the buyer stays on
Free having paid. Nothing in the app can detect that, so the only guard is that each
environment's secret came from its own destination.

Preview deploys are the case this does not stretch to. A per-branch hostname would want a
per-branch destination and the account allows sixteen, so either give staging one stable
hostname with one destination behind it, or leave preview deploys without webhooks and
test purchases locally through `stripe listen`.

### Which API version to give it

A destination in test mode may only take your **account's default** version or "latest" —
an arbitrary version is not on offer. "Latest" moves the day Stripe ships a new one, which
is the drift step 2 warns about. So set the account default to the version the SDK speaks
(Workbench → **API versions**, currently `2026-07-29.dahlia`) and give the destination the
default.

That also settles local forwarding. `stripe listen` has no way to name a version — it
renders events in the account default, or the newest available with `--latest`, and never
the per-destination version. Match the account default and local and deployed agree.

### Testing it locally

No destination is needed to test on localhost. Install the CLI
(`npm install -g @stripe/cli`), then:

```
stripe listen --forward-to localhost:3000/api/auth/stripe/webhook
```

It prints a signing secret of its own — use that as `STRIPE_WEBHOOK_SECRET` while the
listener runs.

The CLI's secret and a destination's secret both start `whsec_` and are not
interchangeable; verifying CLI-forwarded events against a Dashboard destination's secret
is the first thing Stripe's own troubleshooting names for "No signatures found matching
the expected signature for payload". Read the value off the running listener rather than
assuming the one in `.env.local` is still the right kind. `billingConfig()` runs at import,
so changing it needs the dev server stopped and started, not reloaded.

Buy Pro in test mode to produce the events rather than reaching for `stripe trigger`. A
triggered `customer.subscription.created` carries none of the metadata the plugin writes
onto a real Checkout Session, so it takes the branch meant for Subscriptions created by
hand in the Dashboard, and proves nothing about the path a customer walks.

## 6. Check the result

Buy Pro in test mode and confirm three things, in this order of importance:

1. The Checkout page says **Sold through Link** and shows tax as a separate line on top
   of the price.
2. The buyer is on Pro **without returning to the app** — close the tab at the Stripe
   page and read their Plan back.
3. Everything Sealed while they were on Free is readable again.

The statement descriptor reads `LINK.COM*`, and receipts come from Link rather than from
us. That is expected (ADR-0006), and disclosing it to buyers is what keeps the dispute
rate — and with it, continued eligibility — where it needs to be.
