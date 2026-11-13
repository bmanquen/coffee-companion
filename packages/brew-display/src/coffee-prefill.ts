export type PrefillKeep = {
  grinderId?: boolean
  brewingDeviceId?: boolean
  roastDate?: boolean
}

type LatestShot = {
  grinderId: string | null
  brewingDeviceId: string | null
  roastDate: string | null
}

type PrefillDraft = {
  coffeeId: string
  grinderId: string
  brewingDeviceId: string
  roastDate: string | null
}

// Carries the setup and roast date forward from a coffee's latest unsealed
// shot, leaving any field the user already chose alone.
export function applyCoffeePrefill<TDraft extends PrefillDraft>(
  draft: TDraft,
  coffeeId: string,
  latest: LatestShot | null,
  keep: PrefillKeep,
  noRoastDate: TDraft['roastDate'],
): TDraft {
  return {
    ...draft,
    coffeeId,
    grinderId: keep.grinderId
      ? draft.grinderId
      : (latest?.grinderId ?? draft.grinderId),
    brewingDeviceId: keep.brewingDeviceId
      ? draft.brewingDeviceId
      : (latest?.brewingDeviceId ?? draft.brewingDeviceId),
    roastDate: keep.roastDate
      ? draft.roastDate
      : (latest?.roastDate ?? noRoastDate),
  }
}
