# Brew cards show a uniform "dial-in summary", not every setting

Every record renders as a card with a **minimal summary** and an accordion **expander**
for the rest. For brews, the summary is deliberately shaped around *dialing in*: it shows
the levers you actually turn when reproducing a brew, in a single uniform shape across all
five methods —

```
⌖ Coffee (+ variant)   Grind 12 · Dose 18g · Yield 38g · Time 27s
```

Two choices here will look wrong to a future reader unless they read this, so please don't
"fix" them:

- **Water temp (pour over / French press) and Brew Environment (cold brew) live in the
  expander, not the summary** — even though `CONTEXT.md` frames Brew Environment as *"the
  real extraction variable people choose, in place of a hot method's water temperature."*
  By the domain, that's a primary lever and "belongs" up front. We chose a **uniform
  3-slot card** (Grind · weights · Time) across every method over per-method summaries that
  each surface their own odd-one-out lever. Espresso and AeroPress have no such variable;
  promoting it only for the methods that do would break the consistent card shape, which is
  the whole point of this redesign. The lever is one tap away, not gone.

- **The ratio is gone; the real weights are the summary.** The prior dashboard feeds
  emphasised the brew ratio as the headline metric. A ratio hides *how much coffee and how
  much water* — the concrete numbers you need to reproduce a brew — so the summary shows the
  actual, labelled weights as the user entered them (`Dose 18g · Yield 38g`) and no ratio at
  all. (It started as a muted `1:x` hint beside the weights, then was dropped outright as
  redundant with the real numbers — the `brew-ratio` helper went with it.) The stats carry
  their labels (Grind, Dose, Yield, Time) so each number is unambiguous; only the
  self-identifying method-variant goes unlabelled.

Related presentation decisions from the same redesign (not domain-surprising, recorded here
for context, not as commitments): grinder sits in the expander despite grind-setting being
ambiguous without it; equipment cards are flat (no expander) since they have nothing to
hide; cards are an accordion (one open at a time); coffee's summary is identity
(name · roaster · origin) rather than a dial-in triangle, since a coffee is not a brew.

If a method later gains a setting that genuinely dominates dialing in (more than grind or
the weights), revisit whether the uniform triangle still holds — but the default answer is
uniformity, and the burden is on the exception.
