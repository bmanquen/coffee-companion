# The Free plan seals Brew history, not Coffee access

Free users may log unlimited Coffees and unlimited Brews. What the Free plan withholds
is the *past*: a user reads the Brews and dialed-in settings of their five
most-recently-brewed Coffees, and when a Coffee falls outside that five, every Brew it
holds at that moment is sealed. Sealing is permanent — brewing that Coffee again
records new, readable Brews but never reopens the old ones. Only upgrading does.

We landed here after rejecting three alternatives, and the rejections are most of the
value of this record:

- **A creation cap** (Free stops at five Coffees) halts the logging loop. Logging is
  what produces the roaster purchase signal the affiliate revenue needs and the
  shareable dial-ins the community needs, so capping it defends a $4.99 subscription by
  switching off the two revenue lines standing next to it.
- **Sealing whole Coffees** — making an old Coffee unusable rather than merely
  unreadable — dead-ends any user who still owns the bag. They can't reach the Coffee
  to brew it and can't re-add it, since Coffees are unique per user by roaster and
  name, so a bag sitting in the cupboard becomes unloggable. It also teaches Free users
  that adding a Coffee destroys an old one, and the rational response to that is to
  stop adding Coffees.
- **A rotating shelf**, where brewing an old Coffee reopens its history, makes the
  paywall unenforceable: every Sealed Brew would be one cup away from being free.

Consequences to understand before changing anything here:

- **Sealing is decided per Brew, not per Coffee.** A Coffee can sit off the Shelf, be
  brewed again, and then hold readable and Sealed Brews at the same time. Any query that
  "simplifies" this into a coffee-level visibility flag will silently reopen paid data.
- **Reading never depends on a write having happened.** A Brew is withheld when its
  Coffee is off the Shelf, whether or not it has been stamped, so a read path cannot leak
  by forgetting to repair state first. Moving that repair back onto a read path would
  restore the leak this replaced.
- **The stamp is written only where a Coffee could regain its slot.** Its one job is
  keeping a Brew withheld after its Coffee returns to the Shelf, so it is written before
  logging a Brew (which lifts a Coffee to the top) and before deleting a Coffee or a Brew
  (which drops whatever was ranked by it and promotes what sat beneath). Adding a Coffee
  only displaces, so it needs no stamp. Miss one of these and Sealing stops being one-way:
  a Free user could reopen withheld Brews by deleting whatever displaced them.
- **Nothing is ever deleted.** Sealed Brews are retained in full and reopen the instant
  a user upgrades. Data export must ignore Plan state entirely — GDPR Art. 15/20 give
  users a right to their own data whether or not they are paying.
- **Ordering is by last brewed, not created.** A Coffee bought first but still brewed
  weekly must outrank one bought yesterday and disliked. Coffees with no Brews fall back
  to `created_at`, so a newly added Coffee is never sealed on arrival.
- **The dashboard's per-method feeds call `getAll` with no Plan scoping.** Sealing has
  to be enforced once, on the server, or Sealed Brews leak into the dashboard through
  whichever feed nobody remembered to filter.
