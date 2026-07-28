import { createFileRoute } from '@tanstack/react-router'
import { H1 } from '@/components/typography/h1'
import { absoluteUrl } from '@/lib/site-url'

// Placeholder. The real pricing page — Plan catalogue, tier table, annual
// toggle, sealing FAQ and the checkout seam — is issue #48, which replaces this
// file wholesale. It exists now only so the marketing header and footer can
// link somewhere real and typed; without it `<Link to="/pricing">` would not
// compile.
export const Route = createFileRoute('/_marketing/pricing')({
  head: () => ({
    meta: [{ title: 'Pricing — Coffee Companion' }],
    links: [{ rel: 'canonical', href: absoluteUrl('/pricing') }],
  }),
  component: PricingPlaceholder,
})

function PricingPlaceholder() {
  return (
    <div className="py-12">
      <H1 className="text-4xl">Pricing</H1>
    </div>
  )
}
