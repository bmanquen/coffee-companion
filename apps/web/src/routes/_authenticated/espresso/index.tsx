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

export const Route = createFileRoute('/_authenticated/espresso/')({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      context.trpc.espressoShot.getAll.queryOptions(),
    )
  },
  component: EspressoIndex,
})

function EspressoIndex() {
  const trpc = useTRPC()
  const { data: shots } = useSuspenseQuery(
    trpc.espressoShot.getAll.queryOptions(),
  )

  if (shots.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CoffeeIcon />
          </EmptyMedia>
          <EmptyTitle>No Espresso Shots Yet</EmptyTitle>
          <EmptyDescription>
            Start dialing in your espresso by logging your first shot.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link to="/espresso/new">
            <Button>
              <Plus />
              Log Shot
            </Button>
          </Link>
        </EmptyContent>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col items-center w-3/4 mx-auto gap-4">
      <div className="flex justify-between items-center w-full">
        <H1>Espresso</H1>
        <Link to="/espresso/new">
          <Button>
            <Plus />
            Log Shot
          </Button>
        </Link>
      </div>
      {shots.map((shot) => (
        <Card key={shot.id} className="w-full p-4">
          <div className="flex justify-between items-start">
            <h2 className="text-lg font-semibold">{shot.coffee.name}</h2>
            {shot.dose && shot.yield && (
              <span className="text-sm text-muted-foreground">
                1:{(Number(shot.yield) / Number(shot.dose)).toFixed(1)}
              </span>
            )}
          </div>
          <div className="flex gap-4 text-sm text-muted-foreground mt-1">
            {shot.dose && <span>{shot.dose}g in</span>}
            {shot.yield && <span>{shot.yield}g out</span>}
            {shot.time && <span>{shot.time}s</span>}
            {shot.grindSetting && <span>Grind: {shot.grindSetting}</span>}
          </div>
          {shot.notes && (
            <p className="text-sm text-muted-foreground mt-2">{shot.notes}</p>
          )}
        </Card>
      ))}
    </div>
  )
}
