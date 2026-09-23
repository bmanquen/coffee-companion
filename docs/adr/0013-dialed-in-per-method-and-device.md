# Dialed-in for a device is a (method × device) → brew mapping

Coffee-scoped Dialed-in (`isDialedIn` on each brew table) stays the Coffee's
reference Brew. Device-scoped Dialed-in is a different key: one Brew per user
per Brewing Method per Brewing Device. That mapping is its own table with a
unique constraint — not a second boolean on the brew — so lookup cannot reuse
another pair's pointer, and deleting the referenced Brew clears the row (a
trigger on each brew table; `brew_id` cannot be a single FK across five tables).

Device here is the Brewing Device entity, not grinder+device. There is no Plan
cap on how many pairs a user may hold.

We kept the Coffee-scoped flag rather than replacing it: the coffee card, Shelf,
and dashboard already mean "this Coffee's reference Brew." The new pointer is
the baseline for brewing on a given method and device.
