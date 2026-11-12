import { createFileRoute } from '@tanstack/react-router'
import type { BrewMethod } from '@/components/brews/methods'
import { AeropressBrewsSection } from '@/components/brews/aeropress-brews-section'
import { BrewsMethodSelect } from '@/components/brews/brews-method-select'
import { ColdBrewBrewsSection } from '@/components/brews/cold-brew-brews-section'
import { EspressoBrewsSection } from '@/components/brews/espresso-brews-section'
import { FrenchpressBrewsSection } from '@/components/brews/frenchpress-brews-section'
import { isBrewMethod, resolveBrewMethod } from '@/components/brews/methods'
import { PouroverBrewsSection } from '@/components/brews/pourover-brews-section'
import { H1 } from '@/components/typography/h1'
import { espressoShotPageInput } from '@/hooks/use-espresso-shot-pages'

export const Route = createFileRoute('/_authenticated/brews/')({
  // The selected method lives in the URL so a shared or bookmarked link opens
  // that log. Anything not a known method is dropped; the page then falls
  // back to Espresso rather than a broken screen.
  validateSearch: (
    search: Record<string, unknown>,
  ): { method?: BrewMethod } => {
    const method = typeof search.method === 'string' ? search.method : undefined
    return isBrewMethod(method) ? { method } : {}
  },
  loader: ({ context }) => {
    context.queryClient
      .ensureQueryData(
        context.trpc.espressoShot.getRecent.queryOptions(
          espressoShotPageInput(),
        ),
      )
      .catch(() => {})
    context.queryClient
      .ensureQueryData(context.trpc.coffee.getAll.queryOptions())
      .catch(() => {})
    context.queryClient
      .ensureQueryData(context.trpc.aeropressBrew.getAll.queryOptions())
      .catch(() => {})
    context.queryClient
      .ensureQueryData(context.trpc.pouroverBrew.getAll.queryOptions())
      .catch(() => {})
    context.queryClient
      .ensureQueryData(context.trpc.frenchpressBrew.getAll.queryOptions())
      .catch(() => {})
    context.queryClient
      .ensureQueryData(context.trpc.coldBrewBrew.getAll.queryOptions())
      .catch(() => {})
  },
  component: BrewsIndex,
})

// Router-aware wiring: reads the selected method from the URL and writes it
// back on selection. The Brews view below stays router-free so unit tests
// can drive it with props.
function BrewsIndex() {
  const { method } = Route.useSearch()
  const navigate = Route.useNavigate()
  const selectedMethod = resolveBrewMethod(method)

  return (
    <Brews
      selectedMethod={selectedMethod}
      onSelectMethod={(next) => navigate({ search: { method: next } })}
    />
  )
}

export function Brews({
  selectedMethod,
  onSelectMethod,
}: {
  selectedMethod: BrewMethod
  onSelectMethod: (method: BrewMethod) => void
}) {
  return (
    <div className="flex flex-col items-center w-full max-w-6xl mx-auto gap-8">
      <H1 className="w-full">Brews</H1>
      <div className="flex flex-col w-full gap-3">
        <BrewsMethodSelect
          selectedMethod={selectedMethod}
          onSelectMethod={onSelectMethod}
        />
        {selectedMethod === 'espresso' && <EspressoBrewsSection />}
        {selectedMethod === 'aeropress' && <AeropressBrewsSection />}
        {selectedMethod === 'pourover' && <PouroverBrewsSection />}
        {selectedMethod === 'frenchpress' && <FrenchpressBrewsSection />}
        {selectedMethod === 'coldbrew' && <ColdBrewBrewsSection />}
      </div>
    </div>
  )
}
