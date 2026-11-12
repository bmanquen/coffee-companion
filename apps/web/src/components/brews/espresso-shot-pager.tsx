import { Button } from '@/components/ui/button'

export function EspressoShotPager({
  hasMore,
  loadingMore,
  loadMoreError,
  loadMore,
}: {
  hasMore: boolean
  loadingMore: boolean
  loadMoreError: string | null
  loadMore: () => void | Promise<void>
}) {
  if (loadMoreError) {
    return (
      <div className="flex flex-col gap-2">
        <p role="alert">{loadMoreError}</p>
        <Button
          type="button"
          variant="outline"
          disabled={loadingMore}
          onClick={() => {
            void loadMore()
          }}
        >
          Try again
        </Button>
      </div>
    )
  }
  if (!hasMore) return null
  return (
    <Button
      type="button"
      variant="outline"
      disabled={loadingMore}
      onClick={() => {
        void loadMore()
      }}
    >
      Load more
    </Button>
  )
}
