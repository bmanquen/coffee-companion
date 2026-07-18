# Coffee Companion

A personal coffee-brewing tracker. Users record how they brew a given coffee across
several brewing methods so they can reproduce the results they like.

## Language

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
