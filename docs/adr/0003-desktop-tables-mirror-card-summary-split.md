# Desktop tables mirror the card's summary/expander split, not flat detail columns

ADR-0002 gave every record a card with a minimal summary and an accordion expander. On a
wide screen those same records render as a table (cards and tables are one `DataTable`
component, split only by a responsive breakpoint). We decided the desktop tables should
carry the **same** summary/expander split as the card rather than flattening every field
into its own column: a collapsed desktop row shows exactly the fields the card marks as
summary, and clicking the row reveals the rest in an animated detail sub-row — the shape
the dashboard tables already used. This extends ADR-0002 from the card to the table
surface so a record reads identically as a phone card, a dashboard row, or a Brews/Coffees
row.

The surprising, deliberate consequence — please don't "fix" it:

- **Brew and coffee detail fields are no longer table columns.** Grinder, Device,
  Days-off-roast and Notes leave the brew tables; Process, Roast level, Varieties, the
  dialed-in recipe and Notes leave the Coffees table. A field is either an always-visible
  sortable column *or* a revealed-on-expand detail — not both. So the **Brews log loses
  sort-by-days-off-roast, sort-by-grinder and sort-by-device**; only the summary levers
  (Coffee, Grind, Dose, Yield, Time) remain sortable. Coffees had no sorting wired, so it
  loses nothing.

We chose card/dashboard parity over the table's flat scannability. A future reader
staring at the Brews log will wonder why the desktop table dropped columns you could
previously sort — this is intentional. The dropped levers are one click away in the
expander, exactly where the card and dashboard already put them, and uniformity across
surfaces is the point (same argument as ADR-0002's uniform dial-in summary). If a
detail field later proves to *dominate* cross-row comparison on the log — enough that
people genuinely need to sort a whole method's brews by it — revisit whether that one
field earns promotion back to a permanent visible column, but the default is parity and
the burden is on the exception.

## Note: detail lives in one shared component per entity

Because the split is uniform, the expander body is a single shared component per entity
(`BrewDetails` for all five brew methods across card, desktop row and dashboard;
`CoffeeDetails` for coffees), not a per-surface layout. That is what keeps the surfaces
from drifting — there is one place the brew detail is defined, and everything renders it.
Don't re-inline detail rendering into a section to "customize" one surface; the shared
component is the mechanism this ADR relies on.
