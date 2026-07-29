# Marketing promises consistency, not better coffee

Public copy may promise that a Brew can be reproduced. It may not promise that the
product will improve, diagnose, advise on or recommend a Brew. Consistency is what the
app does; better coffee is the user's own — they taste and adjust, and the app's single
job is that nothing is lost between attempts. Every sentence on a marketing page has to
be true of the shipped feature set, and nothing shipped gives advice.

The alternative we rejected was to lead with "brew better coffee" and lean on the AI
features to justify it. Those features are marked `comingSoon` in the Plan catalogue and
Pro+ is not `sellable`, so the claim would have been a cheque the product could not cash
— and the first-run experience would have contradicted the page that sold it. This is
not modesty; it is the only version of the page where every sentence is currently true.

Consequences:

- **The pain, not the mechanic, is the lead.** Copy names what re-deriving settings costs
  in concrete units — mornings, bags, beans poured away — and never states a time or
  money saving in the abstract, and never in dollars. A product charging a subscription
  survives a savings claim only if the reader does the arithmetic themselves; state a
  figure and it becomes a comparison the page loses.
- **"Companion" is behaviour, not a label.** The wordmark carries the noun. Body copy
  shows a companion — present for every Brew, retentive, unopinionated — and never says
  "your brewing companion", which reads as a promise to advise.
- **This can be revisited when AI ships and becomes sellable**, and not before. What
  becomes sayable at that point is what the feature actually does — that the app can
  suggest an adjustment, or read a Brew back and say what to change — stated as a
  capability of a named, buyable Plan. What stays unsayable even then is the unqualified
  "brew better coffee": the improvement is still the user's, and a suggestion they have
  to taste and accept is not a promise of a better cup. Reopen this ADR at that point
  rather than quietly widening the claim.
- **Marketing prose lowercases the ubiquitous language** (see the note in CONTEXT.md).
  Only Dialed-in, Shelf and Sealed keep capitals, so a capital signals a defined term.
  ADR-0004 still governs _what_ the sealing copy may say: sealing stamps Brews, never
  Coffees, in any casing.
- **Unit tests assert the page's claims, not its sentences.** Rewording a hero line is
  free; dropping the Dialed-in explanation, orphaning a call to action or letting the
  method list drift from the catalogue is not.
