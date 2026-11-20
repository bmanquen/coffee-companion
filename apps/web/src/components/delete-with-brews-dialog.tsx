import { useQuery } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import type { UseQueryOptions } from '@tanstack/react-query'

// trpc.{coffee,grinder,brewingDevice}.brewCount.queryOptions(id)
type BrewCountOptions = UseQueryOptions<number, any, number, any>

type Props = {
  noun: string
  name: string
  brewCountOptions: BrewCountOptions
  onDelete: () => void
  isPending: boolean
}

const brews = (count: number) => `${count} ${count === 1 ? 'brew' : 'brews'}`

// The delete confirmation for a coffee, grinder or brewing device, whose brews
// the database deletes with it. It says how many before the user confirms.
export function DeleteWithBrewsDialog(props: Props) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={`Delete ${props.noun}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DeleteWithBrewsContent {...props} />
      </DialogContent>
    </Dialog>
  )
}

// Mounted only while the dialog is open, so the count is fetched then, fresh.
function DeleteWithBrewsContent({
  noun,
  name,
  brewCountOptions,
  onDelete,
  isPending,
}: Props) {
  const query = useQuery(brewCountOptions)
  // A count cached from an earlier opening may be out of date, so show a number
  // only once this opening's own fetch has succeeded. Until then, or if it
  // fails, warn without one.
  const count =
    query.isFetchedAfterMount && query.isSuccess && !query.isFetching
      ? query.data
      : undefined
  // Deleting a brew also clears its Dialed-in mark (a trigger on each brew
  // table), whichever of coffee, grinder or device took it with it.
  const dialedIn = ', including any you marked as dialed in'
  const consequence =
    count === undefined
      ? `This also permanently deletes every brew made with it${dialedIn}.`
      : count === 0
        ? 'No brews were made with it.'
        : `This also permanently deletes ${brews(count)} made with it${dialedIn}.`

  return (
    <>
      <DialogHeader>
        <DialogTitle>Delete {noun}</DialogTitle>
        <DialogDescription>
          Are you sure you want to delete &quot;{name}&quot;? {consequence} This
          cannot be undone.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter showCloseButton>
        <DialogClose asChild>
          <Button variant="destructive" disabled={isPending} onClick={onDelete}>
            {count ? `Delete ${noun} and ${brews(count)}` : 'Delete'}
          </Button>
        </DialogClose>
      </DialogFooter>
    </>
  )
}
