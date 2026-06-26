import { useSuspenseQuery } from '@tanstack/react-query'
import {
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Link, createFileRoute } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import type { SortingState } from '@tanstack/react-table'
import { DataTable } from '@/components/data-table'
import { H1 } from '@/components/typography/h1'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useTRPC } from '@/integrations/trpc/react'

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

const columns = [
  columnHelper.accessor('name', {
    header: 'Name',
  }),
  columnHelper.accessor('brand', {
    header: 'Brand',
  }),
]

type BrewingDevice = {
  id: string
  name: string
  brand: string
  type: { name: string }
}

const deviceColumnHelper = createColumnHelper<BrewingDevice>()

const deviceColumns = [
  deviceColumnHelper.accessor('name', {
    header: 'Name',
  }),
  deviceColumnHelper.accessor('brand', {
    header: 'Brand',
  }),
  deviceColumnHelper.accessor('type.name', {
    header: 'Type',
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
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
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
          <DataTable table={table} />
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
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
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
          <DataTable table={table} />
        </>
      )}
    </Card>
  )
}

function EquipmentIndex() {
  return (
    <div className="flex flex-col items-center w-3/4 mx-auto gap-8">
      <H1 className="w-full">Equipment</H1>
      <GrindersSection />
      <BrewingDevicesSection />
    </div>
  )
}
