import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'

export function CoffeeOriginFields({
  onAddOrigin,
  children,
}: {
  onAddOrigin?: () => void
  children: ReactNode
}) {
  return (
    <>
      {children}
      <Button type="button" variant="outline" size="sm" onClick={onAddOrigin}>
        Add country
      </Button>
    </>
  )
}
