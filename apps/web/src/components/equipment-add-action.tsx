import { Link } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'

type AddRoute = '/equipment/grinders/new' | '/equipment/brewing-devices/new'

export function EquipmentAddAction({
  to,
  label,
  limitNote,
}: {
  to: AddRoute
  label: string
  // The Plan's limit, worded, when the user has reached it. Null when there is
  // room, which is when the add form is worth offering at all.
  limitNote: string | null
}) {
  if (!limitNote) {
    return (
      <Link to={to}>
        <Button>
          <Plus />
          {label}
        </Button>
      </Link>
    )
  }

  return (
    <div className="flex items-center gap-3">
      <p className="text-sm text-muted-foreground">{limitNote}</p>
      <Link to="/pricing">
        <Button variant="outline">See plans</Button>
      </Link>
    </div>
  )
}
