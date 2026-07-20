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

// The delete-confirmation dialog shared by every /brews section's actions cell.
// The edit link stays inline in each section (to keep TanStack's typed-route
// checking); only this dialog — the bulky, identical part — is shared. `noun`
// is "shot" (espresso) or "brew" (the rest).
export function DeleteBrewDialog({
  noun,
  coffeeName,
  onDelete,
  isPending,
}: {
  noun: string
  coffeeName: string
  onDelete: () => void
  isPending: boolean
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={`Delete ${noun}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {noun}</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete this {noun} for &quot;
            {coffeeName}&quot;? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter showCloseButton>
          <DialogClose asChild>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={onDelete}
            >
              Delete
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
