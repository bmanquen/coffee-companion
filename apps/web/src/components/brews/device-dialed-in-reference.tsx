import { useQuery } from '@tanstack/react-query'
import { useTRPC } from '@/integrations/trpc/react'
import type {
  BrewingMethod,
  DialedInBrewView,
} from '@coffee-companion/api/lib/dialed-in-brew'

function formatReference(view: DialedInBrewView) {
  if (view.sealed) return 'Sealed'
  const parts = [view.coffeeName]
  if (view.grindSetting) parts.push(`Grind ${view.grindSetting}`)
  if (view.dose) parts.push(`Dose ${view.dose}g`)
  if (view.outputGrams) parts.push(`${view.outputLabel} ${view.outputGrams}g`)
  if (view.time != null) parts.push(`Time ${view.time}${view.timeUnit}`)
  return parts.join(' · ')
}

// Shown on a method's log form once a brewing device is chosen. Looks up the
// Dialed-in Brew for this method × device only — another pair is never reused.
export function DeviceDialedInReference({
  brewingMethod,
  brewingDeviceId,
}: {
  brewingMethod: BrewingMethod
  brewingDeviceId: string
}) {
  const trpc = useTRPC()
  const { data } = useQuery({
    ...trpc.dialedInBrew.get.queryOptions({
      brewingMethod,
      brewingDeviceId,
    }),
    enabled: Boolean(brewingDeviceId),
    staleTime: Infinity,
  })

  if (!brewingDeviceId || !data) return null

  return (
    <div
      role="status"
      aria-label={`Dialed-in for ${data.deviceName}`}
      className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm"
    >
      <p className="font-medium text-foreground">
        Dialed-in for {data.deviceName}
      </p>
      <p className="text-muted-foreground">{formatReference(data)}</p>
    </div>
  )
}
