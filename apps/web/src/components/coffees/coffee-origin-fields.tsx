import { Button } from '@/components/ui/button'
import type { ReactNode } from 'react'

export function CoffeeOriginFields({
  onAddOrigin,
  children,
}: {
  onAddOrigin?: () => void
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3">
      {children}
      <Button type="button" variant="outline" size="sm" onClick={onAddOrigin}>
        Add origin
      </Button>
    </div>
  )
}
