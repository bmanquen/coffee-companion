# Cold Brew is modelled without a method-variant lookup

Every other brewing method (Espresso aside) carries a `{method}_methods` lookup table
and a `methodId` foreign key on its brews, even when only a single `"Standard"` variant
is ever seeded. We deliberately omit that layer for Cold Brew: it has one real technique
(immersion), so a variant lookup would be pure ceremony.

Consequences that diverge from the templated per-method pattern:

- **No `cold_brew_methods` table and no method router.** Cold Brew ships with only a
  brew router.
- **No `methodId` on `cold_brew_brews`.** Dialed-in uniqueness is per coffee (`unique
  where is_dialed_in` on `coffeeId` alone), not per coffee *per method*. `setDialedIn`
  takes `coffeeId` + `brewId`, no `methodId`.
- **UI has no method picker** on the cold brew new/edit forms.

We chose an honest model over template symmetry. A future reader will notice Cold Brew
is the one method without a lookup — this is intentional, not an oversight, so please
don't "fix" the asymmetry by adding one. If genuinely distinct techniques appear later
(e.g. Cold Drip / Kyoto slow-drip, which has different mechanics), revisit this: adding
the lookup back is a migration plus a backfill.

## Note: the per-method model is deliberately not data-driven

The templated per-method pattern this ADR diverges from — one hand-built, typed table
(and usually a variant lookup) per method — is itself a deliberate choice, not just
where we happened to land. When the dashboard switcher was reworked, we considered
generalizing methods into an open-ended, data-driven catalog (methods as rows, settings
as dynamic field descriptors) so new methods could be added without a code change. We
rejected it: typed, bespoke per-method settings are the product (see `CONTEXT.md`), and
a dynamic schema would trade that away. The method set stays curated and typed, and
grows deliberately — a new method is a real vertical slice, not a data entry. Don't
reopen this to "scale" the catalog; that scaling pressure belongs in the UI (a picker
that degrades gracefully), not in the data model.
