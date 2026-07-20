import { Crosshair } from 'lucide-react'
import { Button } from '@/components/ui/button'

// The dialed-in crosshair toggle shared by every /brews section's dialed-in
// column. Visual only — each section wires its own `setDialedIn` mutation into
// `onToggle`, since the payload differs per method (espresso uses `shotId` on
// `coffee.setDialedIn`; the method-based brews add `methodId`; cold brew is
// methodless). The aria-labels also differ (the method-based ones name the
// method), so they're passed in.
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
