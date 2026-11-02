import { ESPRESSO_DEVICE_TYPE } from '@coffee-companion/api/lib/espresso'
import type { NamedOption } from './types'

export function espressoDevicesFrom(
  devices: Array<{ id: string; name: string; type: { name: string } }>,
): Array<NamedOption> {
  return devices
    .filter((device) => device.type.name === ESPRESSO_DEVICE_TYPE)
    .map(({ id, name }) => ({ id, name }))
}
