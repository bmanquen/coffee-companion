# Dialed-in is one brew per coffee × method × device

A Brew is Dialed-in for a Coffee, a Brewing Method, and a Brewing Device. There
is exactly one such Brew per user for that triple: marking another replaces the
current one, and unmarking or deleting it leaves none. A different coffee,
method, or device is a different triple. The table is unique on
`(user, coffee, method, device)` and on `brew_id`.

Device here is the Brewing Device entity, not grinder+device. There is no Plan
cap. Deleting a Brew removes only that Brew's membership (a trigger on each
brew table; `brew_id` cannot be a single FK across five tables).

A Coffee is Dialed-in when it has at least one membership. That existence is
derived at read time — there is no `isDialedIn` column on Coffee or Brew.
