import { Button } from '@/components/ui/button'

// One button for Load more and its retry, so a keyboard user's focus stays put
// when a load fails. It stays focusable while loading (aria-disabled, not
// disabled) and ignores activation until the load settles.
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
  if (!loadMoreError && !hasMore) return null
  return (
    <div className="flex flex-col gap-2">
      {loadMoreError ? <p role="alert">{loadMoreError}</p> : null}
      <Button
        type="button"
        variant="outline"
        aria-disabled={loadingMore}
        className={loadingMore ? 'opacity-50' : undefined}
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
