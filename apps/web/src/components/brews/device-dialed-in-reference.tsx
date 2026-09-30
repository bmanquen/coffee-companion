import { useQuery } from '@tanstack/react-query'
import type {
  BrewingMethod,
  DialedInBrewView,
} from '@coffee-companion/api/lib/dialed-in-brew'
import { useTRPC } from '@/integrations/trpc/react'
import { formatBrewRatio } from '@/lib/brew'

function formatReference(view: DialedInBrewView) {
  if (view.sealed) return 'Sealed'
  const parts = [view.coffeeName]
  if (view.grindSetting) parts.push(`Grind ${view.grindSetting}`)
  if (view.dose) parts.push(`Dose ${view.dose}g`)
  if (view.outputGrams) parts.push(`${view.outputLabel} ${view.outputGrams}g`)
  const ratio = formatBrewRatio(view.dose, view.outputGrams)
  if (ratio) parts.push(ratio)
  if (view.time != null) parts.push(`Time ${view.time}${view.timeUnit}`)
  return parts.join(' · ')
}

// Shown on a method's log form once a coffee and brewing device are chosen.
// Looks up the Dialed-in brew for this coffee × method × device only.
export function DeviceDialedInReference({
  coffeeId,
  brewingMethod,
  brewingDeviceId,
}: {
  coffeeId: string
  brewingMethod: BrewingMethod
  brewingDeviceId: string
}) {
  const trpc = useTRPC()
  const enabled = Boolean(coffeeId && brewingDeviceId)
  const { data } = useQuery({
    ...trpc.dialedInBrew.get.queryOptions({
      coffeeId,
      brewingMethod,
      brewingDeviceId,
    }),
    enabled,
    // Mark, unmark, delete, and brew edit invalidate this query.
    staleTime: Infinity,
  })

  const view = data?.[0]
  if (!enabled || !view) return null

  return (
    <div
      role="status"
      aria-label={`Dialed-in for ${view.deviceName}`}
      className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm"
    >
      <p className="font-medium text-foreground">
        Dialed-in for {view.deviceName}
      </p>
      <p className="text-muted-foreground">{formatReference(view)}</p>
    </div>
  )
}
