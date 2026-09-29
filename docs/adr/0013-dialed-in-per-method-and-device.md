# Dialed-in is membership in a (coffee × method × device) set

A Brew is Dialed-in for a Coffee, a Brewing Method, and a Brewing Device. Many
Brews can belong to that set at once: marking one does not replace the others,
and unmarking one leaves the rest. The table is membership — unique on `brew_id`
only — not a single pointer per pair.

Device here is the Brewing Device entity, not grinder+device. There is no Plan
cap on how many members a set may hold. Deleting a Brew removes only that Brew
from the set (a trigger on each brew table; `brew_id` cannot be a single FK
across five tables).

A Coffee is Dialed-in when it has at least one membership. That existence is
derived at read time — there is no `isDialedIn` column on Coffee or Brew.
