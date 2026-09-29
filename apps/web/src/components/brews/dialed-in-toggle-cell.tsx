import { Crosshair } from 'lucide-react'
import type { BrewingMethod } from '@coffee-companion/api/lib/dialed-in-brew'
import { Button } from '@/components/ui/button'
import { useDeviceDialedIn } from '@/hooks/use-device-dialed-in'

export function DialedInToggleCell({
  dialedIn,
  onToggle,
  onLabel,
  offLabel,
}: {
  dialedIn: boolean
  onToggle: () => void
  onLabel: string
  offLabel: string
}) {
  return (
    <Button
      variant={dialedIn ? 'default' : 'ghost'}
      size="icon"
      className="h-8 w-8"
      aria-label={dialedIn ? onLabel : offLabel}
      aria-pressed={dialedIn}
      onClick={onToggle}
    >
      <Crosshair className="h-4 w-4" />
    </Button>
  )
}

export function BrewDialedInCell({
  brewingMethod,
  brew,
}: {
  brewingMethod: BrewingMethod
  brew: {
    id: string
    brewingDeviceId: string | null
    isDialedIn: boolean
    sealed: boolean
    coffee: { name: string }
  }
}) {
  const { toggle } = useDeviceDialedIn(brewingMethod)
  if (brew.sealed) return null

  return (
    <DialedInToggleCell
      dialedIn={brew.isDialedIn}
      onLabel={`Dialed in ${brew.coffee.name} — clear`}
      offLabel={`Mark ${brew.coffee.name} as dialed in`}
      onToggle={() => toggle(brew)}
    />
  )
}
