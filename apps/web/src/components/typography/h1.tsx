import * as React from 'react'

import { cn } from '@/lib/utils'

function H1({ className, ...props }: React.ComponentProps<'h1'>) {
  return (
    <h1
      data-slot="h1"
      className={cn('text-2xl font-bold tracking-tight', className)}
      {...props}
    />
  )
}

export { H1 }
