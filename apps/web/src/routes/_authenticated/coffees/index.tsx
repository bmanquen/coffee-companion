import { useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { CoffeeIcon, Plus } from 'lucide-react'
import { H1 } from '@/components/typography/h1'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { useTRPC } from '@/integrations/trpc/react'

export const Route = createFileRoute('/_authenticated/coffees/')({
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(
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
    <div className="flex flex-col items-center w-full max-w-4xl mx-auto gap-4">
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
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <h2 className="text-lg font-semibold">{coffee.name}</h2>
            {coffee.country && (
              <p className="text-muted-foreground text-sm">
                <span className="font-bold">Country: </span>
                {coffee.country.name}
              </p>
            )}
            {coffee.region && (
              <p className="text-muted-foreground text-sm">
                <span className="font-bold">Region: </span>
                {coffee.region.name}
              </p>
            )}
            {coffee.process && (
              <p className="text-muted-foreground text-sm">
                <span className="font-bold">Process: </span>
                {coffee.process.name}
              </p>
            )}
          </div>
          {coffee.notes && (
            <p className="text-sm text-muted-foreground">{coffee.notes}</p>
          )}
          {coffee.dialedInShot && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mt-2 border-t pt-2">
              <span className="font-medium text-foreground">Dialed In:</span>
              {coffee.dialedInShot.dose && (
                <span>{coffee.dialedInShot.dose}g in</span>
              )}
              {coffee.dialedInShot.yield && (
                <span>{coffee.dialedInShot.yield}g out</span>
              )}
              {coffee.dialedInShot.time && (
                <span>{coffee.dialedInShot.time}s</span>
              )}
              {coffee.dialedInShot.grindSetting && (
                <span>Grind: {coffee.dialedInShot.grindSetting}</span>
              )}
            </div>
          )}
        </Card>
      ))}
    </div>
  )
}
