import { Link } from '@tanstack/react-router'

export function MarketingFooter() {
  return (
    <footer className="mt-20 border-t border-border">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>Coffee Companion</span>
        <nav className="flex gap-4" aria-label="Footer">
          <Link to="/" className="hover:text-foreground">
            Home
          </Link>
          <Link to="/pricing" className="hover:text-foreground">
            Pricing
          </Link>
        </nav>
      </div>
    </footer>
  )
}
