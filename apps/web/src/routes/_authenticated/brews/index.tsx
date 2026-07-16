import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { AeropressBrewsSection } from '@/components/brews/aeropress-brews-section'
import { EspressoBrewsSection } from '@/components/brews/espresso-brews-section'
import { FrenchpressBrewsSection } from '@/components/brews/frenchpress-brews-section'
import { PouroverBrewsSection } from '@/components/brews/pourover-brews-section'
import { H1 } from '@/components/typography/h1'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_authenticated/brews/')({
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(
      context.trpc.espressoShot.getAll.queryOptions(),
    )
    context.queryClient.ensureQueryData(
      context.trpc.aeropressBrew.getAll.queryOptions(),
    )
    context.queryClient.ensureQueryData(
      context.trpc.pouroverBrew.getAll.queryOptions(),
    )
    context.queryClient.ensureQueryData(
      context.trpc.frenchpressBrew.getAll.queryOptions(),
    )
  },
  component: BrewsIndex,
})

type BrewMethod = 'espresso' | 'aeropress' | 'pourover' | 'frenchpress'

const brewMethods: Array<{ value: BrewMethod; label: string }> = [
  { value: 'espresso', label: 'Espresso' },
  { value: 'aeropress', label: 'AeroPress' },
  { value: 'pourover', label: 'Pour Over' },
  { value: 'frenchpress', label: 'French Press' },
]

function BrewsIndex() {
  const [selectedMethod, setSelectedMethod] = useState<BrewMethod>('espresso')

  return (
    <div className="flex flex-col items-center w-full max-w-6xl mx-auto gap-8">
      <H1 className="w-full">Brews</H1>
      <div className="flex flex-col w-full">
        <div className="flex gap-1 pl-3 -mb-px" role="tablist">
          {brewMethods.map((method) => {
            const isActive = selectedMethod === method.value
            return (
              <button
                key={method.value}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setSelectedMethod(method.value)}
                className={cn(
                  'relative rounded-t-lg border px-4 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'z-10 border-border border-b-transparent bg-white text-foreground shadow-sm'
                    : 'border-transparent bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {method.label}
              </button>
            )
          })}
        </div>
        {selectedMethod === 'espresso' && <EspressoBrewsSection />}
        {selectedMethod === 'aeropress' && <AeropressBrewsSection />}
        {selectedMethod === 'pourover' && <PouroverBrewsSection />}
        {selectedMethod === 'frenchpress' && <FrenchpressBrewsSection />}
      </div>
    </div>
  )
}
