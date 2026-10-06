# A lookup name is unique within what each user sees

A lookup mixes shared defaults (`user_id` null) with one user's own rows.
Within what that user sees, a name appears once, ignoring case. Regions
compare within a country, farms within a region. Different users may share
a name. A missing parent is one scope.

Postgres owns the rule: a stored `name_key` (`lower(name)`), a unique
constraint `NULLS NOT DISTINCT` on `(user_id, name_key[, parent])`, and
one BEFORE trigger that refuses a user write matching a shared default or
the writer's own entry. The trigger never refuses a shared write — seeds
keep `ON CONFLICT DO NOTHING`, and a later shared default is inserted
first, then `lookup_fold()`.

`lookup_fold()` keeps the shared row when a user copy matches it, else the
oldest `created_at, id`. Identical relation rows (variety links, origins
that agree outside their key) dedupe; any other PK collision — two origins
of one coffee with different regions — aborts. A roaster fold that would
give one user two coffees with the same name renames the later coffee to
a name that is not already taken on the keeper roaster, so a later shared
default can call `lookup_fold()` without aborting. Folding
a user's `aeropress` into shared `AeroPress` makes that user's devices
qualify for AeroPress brews; the shared gating casing is the keeper.
