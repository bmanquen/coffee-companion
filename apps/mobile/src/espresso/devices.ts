import { isEspressoDevice } from '@coffee-companion/api/lib/espresso'
import type { NamedOption } from './types'

export function espressoDevicesFrom(
  devices: Array<{ id: string; name: string; type: { name: string } }>,
): Array<NamedOption> {
  return devices.filter(isEspressoDevice).map(({ id, name }) => ({ id, name }))
}
