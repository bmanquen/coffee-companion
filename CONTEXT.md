# Coffee Companion

A personal coffee-brewing tracker. Users record how they brew a given coffee across
several brewing methods so they can reproduce the results they like.

## Language

Capitals mark defined terms. In the app and in these docs the whole language is
capitalised; in public marketing prose only the invented terms — Dialed-in, Shelf,
Sealed — keep their capitals, and the ordinary words (brew, coffee, brewing method,
grinder, brewing device) are lowercased. A visitor has not read this glossary, so a
capital there has to mean "this word has a definition" rather than "this word is ours".
UI labels keep their casing either way. See ADR-0005.

**Coffee**:
A roaster's product — a named offering, not a single bag. Buying the same offering
twice is the same Coffee, so a Coffee is unique per user by roaster and name.
_Avoid_: Bean, bag, lot

**Brewing Method**:
A distinct way of brewing coffee (Espresso, Pour Over, French Press, AeroPress, Cold
Brew). Each method captures its own typed brew settings.
_Avoid_: Recipe, technique

**Brew**:
A single logged attempt at brewing a coffee with a method, holding the settings used
(dose, water, times, etc.). Espresso's brew is called a Shot.
_Avoid_: Log, entry

**Method Variant**:
A named sub-technique within a brewing method (e.g. AeroPress Standard vs. Inverted),
stored in that method's lookup table. Not every method has meaningful variants —
Cold Brew has none and is modelled without a variant lookup (see ADR-0001).
_Avoid_: Style, mode

**Dialed-in**:
The flag marking a brew as the reference settings to reproduce for a coffee. At most
one dialed-in brew per coffee per method variant; Cold Brew allows at most one per
coffee (it has no variants).

## Plans

**Plan**:
The tier of access a user has — Free, Pro, or Pro+. It governs how much of the user's
own past stays readable, and how many Grinders, Brewing Devices, and AI calls they may
use. It never limits how much they may log.
_Avoid_: Tier, subscription level, membership

**Subscription**:
The recurring paid arrangement that grants a paid Plan for as long as it is paid. Not a
synonym for Plan: the Plan is the tier of access, the Subscription is what pays for one,
and a user can hold a paid Plan without a Subscription (see Grant).
_Avoid_: Membership, billing, plan

**Grant**:
A paid Plan given without payment — a comp, a beta tester, a goodwill gesture after a
support failure, a developer's own account. It carries the reason it was given and,
optionally, when it ends. A Grant and a Subscription may both apply to one user, and the
more generous of the two is that user's Plan.
_Avoid_: Override, freebie, coupon, discount

**Shelf**:
The Coffees whose Brews a user can read. Free holds five, ordered by most recently
brewed; paid Plans hold the whole library. Its size is therefore a function of the Plan,
so gaining or losing a paid Plan resizes it — and the Coffees that fall off a shrinking
Shelf Seal (see ADR-0007). A Coffee off the Shelf is still fully usable — only its past
is out of reach.
_Avoid_: Active coffees, viewable coffees, library

**Sealed Brew**:
A Brew made unreadable because its Coffee fell off the Shelf. Sealing stamps the Brews
a Coffee holds at that moment, and on Free it is permanent: brewing that Coffee again
records new, readable Brews but never reopens the old ones — only upgrading does.
Nothing is ever deleted (see ADR-0004).
_Avoid_: Archived, hidden, locked, expired

## Cold Brew

**Cold Brew**:
Coffee brewed by steeping coarse grounds in ambient-temperature water for many hours
(typically 12–24), then filtering. Distinct from the hot immersion methods: hour-scale
steep, no hot water, and it usually yields a Concentrate.

**Concentrate**:
The strong brewed liquid a Cold Brew produces before any dilution. A Cold Brew's
recorded settings describe how the concentrate was made — this is what gets dialed in
and repeated.
_Avoid_: Extract, base

**Dilution**:
Water or milk added to a Concentrate at serving time to reach drinking strength. A
serving-time choice that varies cup-to-cup, **not** a property of the brew — so it is
deliberately not modelled on the Cold Brew brew (v1).
_Avoid_: Cut, mix

**Brew Environment**:
Where a Cold Brew steeps — on the counter (room temperature) or in the fridge — which
is the real extraction variable people choose, in place of a hot method's water
temperature. Optional.
_Avoid_: Location, temperature
