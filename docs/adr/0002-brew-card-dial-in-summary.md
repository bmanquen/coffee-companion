# Brew cards show a uniform "dial-in summary", not every setting

Every record renders as a card with a **minimal summary** and an accordion **expander**
for the rest. For brews, the summary is deliberately shaped around *dialing in*: it shows
the levers you actually turn when reproducing a brew, in a single uniform shape across all
five methods —

```
⌖ Coffee (+ variant)   Grind · Dose→Yield/Water (1:x) · Time
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

- **The ratio is demoted from hero to a muted `(1:x)` hint; real weights lead.** The prior
  dashboard feeds emphasised the ratio as the headline metric. A ratio hides *how much
  coffee and how much water* — the concrete numbers you need to reproduce a brew — so the
  summary now leads with actual grams (`18g → 38g`) and keeps the ratio only as a
  low-emphasis aid for people who think in ratios.

Related presentation decisions from the same redesign (not domain-surprising, recorded here
for context, not as commitments): grinder sits in the expander despite grind-setting being
ambiguous without it; equipment cards are flat (no expander) since they have nothing to
hide; cards are an accordion (one open at a time); coffee's summary is identity
(name · roaster · origin) rather than a dial-in triangle, since a coffee is not a brew.

If a method later gains a setting that genuinely dominates dialing in (more than grind or
the weights), revisit whether the uniform triangle still holds — but the default answer is
uniformity, and the burden is on the exception.
