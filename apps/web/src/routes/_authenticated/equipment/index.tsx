import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import {
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Link, createFileRoute } from '@tanstack/react-router'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { CellContext, SortingState } from '@tanstack/react-table'
import { DataTable } from '@/components/data-table'
import { H1 } from '@/components/typography/h1'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
import { Input } from '@/components/ui/input'
import { useTRPC } from '@/integrations/trpc/react'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_authenticated/equipment/')({
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(
      context.trpc.grinder.list.queryOptions(),
    )
    context.queryClient.ensureQueryData(
      context.trpc.brewingDevice.list.queryOptions(),
    )
  },
  component: EquipmentIndex,
})

type Grinder = {
  id: string
  name: string
  brand: string
}

const columnHelper = createColumnHelper<Grinder>()

function GrinderActionsCell({ row }: CellContext<Grinder, unknown>) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const deleteGrinder = useMutation(
    trpc.grinder.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.grinder.list.queryOptions())
      },
    }),
  )

  const grinder = row.original

  return (
    <div className="flex items-center justify-end gap-1">
      <Link
        to="/equipment/grinders/$grinderId/edit"
        params={{ grinderId: grinder.id }}
      >
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label="Edit grinder"
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </Link>
      <Dialog>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Delete grinder"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete grinder</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{grinder.name}&quot;? This
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter showCloseButton>
            <DialogClose asChild>
              <Button
                variant="destructive"
                disabled={deleteGrinder.isPending}
                onClick={() => deleteGrinder.mutate(grinder.id)}
              >
                Delete
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const columns = [
  // Card layout: Brand + Name make up the card title (see cardTitle); no body.
  columnHelper.accessor('brand', {
    header: 'Brand',
    meta: { cardTitle: true },
  }),
  columnHelper.accessor('name', {
    header: 'Name',
    meta: { cardTitle: true },
  }),
  columnHelper.display({
    id: 'actions',
    header: '',
    cell: GrinderActionsCell,
    enableSorting: false,
    meta: { cardHideLabel: true },
  }),
]

type BrewingDevice = {
  id: string
  name: string
  brand: string
  type: { name: string }
}

const deviceColumnHelper = createColumnHelper<BrewingDevice>()

function DeviceActionsCell({ row }: CellContext<BrewingDevice, unknown>) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const deleteDevice = useMutation(
    trpc.brewingDevice.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.brewingDevice.list.queryOptions())
      },
    }),
  )

  const device = row.original

  return (
    <div className="flex items-center justify-end gap-1">
      <Link
        to="/equipment/brewing-devices/$deviceId/edit"
        params={{ deviceId: device.id }}
      >
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label="Edit brewing device"
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </Link>
      <Dialog>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Delete brewing device"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete brewing device</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{device.name}&quot;? This
              also removes its espresso shots and cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter showCloseButton>
            <DialogClose asChild>
              <Button
                variant="destructive"
                disabled={deleteDevice.isPending}
                onClick={() => deleteDevice.mutate(device.id)}
              >
                Delete
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const deviceColumns = [
  // Card layout: Brand + Name make up the card title (see cardTitle); Type is
  // desktop-only (cardHidden) so the card stays to just the title.
  deviceColumnHelper.accessor('brand', {
    header: 'Brand',
    meta: { cardTitle: true },
  }),
  deviceColumnHelper.accessor('name', {
    header: 'Name',
    meta: { cardTitle: true },
  }),
  deviceColumnHelper.accessor('type.name', {
    header: 'Type',
    meta: { cardHidden: true },
  }),
  deviceColumnHelper.display({
    id: 'actions',
    header: '',
    cell: DeviceActionsCell,
    enableSorting: false,
    meta: { cardHideLabel: true },
  }),
]

function GrindersSection() {
  'use no memo'
  const trpc = useTRPC()
  const { data: grinders } = useSuspenseQuery(trpc.grinder.list.queryOptions())

  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')

  const table = useReactTable({
    data: grinders as Array<Grinder>,
    columns,
    state: { sorting, globalFilter },
    initialState: { pagination: { pageSize: 10 } },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  return (
    <Card className="flex flex-col gap-4 w-full bg-white p-6">
      <div className="flex justify-between items-center w-full">
        <h2 className="text-lg font-semibold">Grinders</h2>
        <Link to="/equipment/grinders/new">
          <Button>
            <Plus />
            Add Grinder
          </Button>
        </Link>
      </div>
      {grinders.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No grinders yet.{' '}
          <Link to="/equipment/grinders/new" className="underline">
            Add your first grinder
          </Link>
          .
        </p>
      ) : (
        <>
          <Input
            placeholder="Filter grinders..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="w-full"
          />
          <DataTable table={table} paginated />
        </>
      )}
    </Card>
  )
}

function BrewingDevicesSection() {
  'use no memo'
  const trpc = useTRPC()
  const { data: devices } = useSuspenseQuery(
    trpc.brewingDevice.list.queryOptions(),
  )

  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')

  const table = useReactTable({
    data: devices as Array<BrewingDevice>,
    columns: deviceColumns,
    state: { sorting, globalFilter },
    initialState: { pagination: { pageSize: 10 } },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  return (
    <Card className="flex flex-col gap-4 w-full bg-white p-6">
      <div className="flex justify-between items-center w-full">
        <h2 className="text-lg font-semibold">Brewing Devices</h2>
        <Link to="/equipment/brewing-devices/new">
          <Button>
            <Plus />
            Add Brewing Device
          </Button>
        </Link>
      </div>
      {devices.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No brewing devices yet.{' '}
          <Link to="/equipment/brewing-devices/new" className="underline">
            Add your first brewing device
          </Link>
          .
        </p>
      ) : (
        <>
          <Input
            placeholder="Filter brewing devices..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="w-full"
          />
          <DataTable table={table} paginated />
        </>
      )}
    </Card>
  )
}

type EquipmentType = 'grinders' | 'brewing-devices'

const equipmentTypes: Array<{ value: EquipmentType; label: string }> = [
  { value: 'grinders', label: 'Grinders' },
  { value: 'brewing-devices', label: 'Brewing Devices' },
]

function EquipmentIndex() {
  const [selectedType, setSelectedType] = useState<EquipmentType>('grinders')

  return (
    <div className="flex flex-col items-center w-full max-w-4xl mx-auto gap-8">
      <H1 className="w-full">Equipment</H1>
      <div className="flex flex-col w-full">
        <div className="flex gap-1 pl-3 -mb-px" role="tablist">
          {equipmentTypes.map((type) => {
            const isActive = selectedType === type.value
            return (
              <button
                key={type.value}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setSelectedType(type.value)}
                className={cn(
                  'relative rounded-t-lg border px-4 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'z-10 border-border border-b-transparent bg-white text-foreground shadow-sm'
                    : 'border-transparent bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {type.label}
              </button>
            )
          })}
        </div>
        {selectedType === 'grinders' ? (
          <GrindersSection />
        ) : (
          <BrewingDevicesSection />
        )}
      </div>
    </div>
  )
}
