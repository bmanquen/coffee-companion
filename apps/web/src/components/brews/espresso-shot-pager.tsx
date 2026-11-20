import { useState } from 'react'
import { Button } from '@/components/ui/button'

// One button for Load more and its retry, so a keyboard user's focus stays put
// when a load fails. It stays focusable while loading (aria-disabled, not
// disabled) and ignores activation until the load settles. When the last page
// lands while it has focus, focus moves to an end-of-list note instead of
// falling back to the page.
export function EspressoShotPager({
  hasMore,
  loadingMore,
  loadMoreError,
  loadMore,
}: {
  hasMore: boolean
  loadingMore: boolean
  loadMoreError: string | null
  loadMore: () => unknown
}) {
  // Removing a focused element fires no blur, so this stays true when the
  // button goes away with focus on it.
  const [focused, setFocused] = useState(false)
  if (!loadMoreError && !hasMore) {
    if (!focused) return null
    return (
      <p
        ref={(note) => note?.focus()}
        tabIndex={-1}
        className="text-muted-foreground text-sm"
        onBlur={() => setFocused(false)}
      >
        All shots loaded
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      {loadMoreError ? <p role="alert">{loadMoreError}</p> : null}
      <Button
        type="button"
        variant="outline"
        aria-disabled={loadingMore}
        className={loadingMore ? 'opacity-50' : undefined}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onClick={() => {
          if (loadingMore) return
          void loadMore()
        }}
      >
        {loadMoreError ? 'Try again' : 'Load more'}
      </Button>
    </div>
  )
}
