import { useTRPC } from '@/integrations/trpc/react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from '@/components/ui/empty'
import { CoffeeIcon, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSuspenseQuery } from '@tanstack/react-query'
import { Card } from '@/components/ui/card'
import { H1 } from '@/components/typography/h1'

export const Route = createFileRoute('/coffees/')({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      context.trpc.coffee.getAll.queryOptions(),
    )
  },
  component: Coffee,
})

function Coffee() {
  const trpc = useTRPC()
  const { data: coffees } = useSuspenseQuery(trpc.coffee.getAll.queryOptions())

  if (coffees.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CoffeeIcon />
          </EmptyMedia>
          <EmptyTitle>No Coffees Yet</EmptyTitle>
          <EmptyDescription>
            You haven&apos;t added any coffees yet. Please add some coffee to
            get started.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link to="/coffees/new">
            <Button>
              <Plus />
              Add Coffee
            </Button>
          </Link>
        </EmptyContent>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col items-center w-3/4 mx-auto gap-4">
      <div className="flex justify-between items-center w-full">
        <H1>Coffees</H1>
        <Link to="/coffees/new">
          <Button>
            <Plus />
            Add Coffee
          </Button>
        </Link>
      </div>
      {coffees.map((coffee) => (
        <Card key={coffee.id} className="w-full p-4">
          <h2 className="text-lg font-semibold">{coffee.name}</h2>
          {coffee.notes && (
            <p className="text-sm text-muted-foreground">{coffee.notes}</p>
          )}
        </Card>
      ))}
    </div>
  )
}
