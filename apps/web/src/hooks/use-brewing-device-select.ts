import { useSuspenseQuery } from '@tanstack/react-query'
import { useSearchSelectResource } from '@/hooks/use-search-select-resource'
import { useTRPC } from '@/integrations/trpc/react'

// The brewing-device SearchSelect options for a brew form, filtered to the
// method's device type (Espresso / Pour Over / … / Cold Brew). Every new and
// edit brew form needs exactly this, so it's shared. The route loader still
// prefetches brewingDevice.list; this reads from that cache.
export function useBrewingDeviceSelect(deviceType: string) {
  const trpc = useTRPC()
  const { data: brewingDevices } = useSuspenseQuery(
    trpc.brewingDevice.list.queryOptions(),
  )
  const devices = brewingDevices.filter(
    (device) => device.type.name === deviceType,
  )
  return useSearchSelectResource(devices)
}
