import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EspressoShotPager } from './espresso-shot-pager'

describe('EspressoShotPager', () => {
  it('keeps focus on the same button when a load fails, and ignores clicks while loading', () => {
    const loadMore = vi.fn()
    const props = { hasMore: true, loadMore }
    const { rerender } = render(
      <EspressoShotPager {...props} loadingMore={false} loadMoreError={null} />,
    )
    const button = screen.getByRole('button', { name: 'Load more' })
    button.focus()

    rerender(<EspressoShotPager {...props} loadingMore loadMoreError={null} />)
    fireEvent.click(button)
    expect(loadMore).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(button)

    rerender(
      <EspressoShotPager
        {...props}
        loadingMore={false}
        loadMoreError="Couldn't load more shots."
      />,
    )
    expect(screen.getByRole('alert').textContent).toBe(
      "Couldn't load more shots.",
    )
    expect(screen.getByRole('button', { name: 'Try again' })).toBe(button)
    expect(document.activeElement).toBe(button)
    fireEvent.click(button)
    expect(loadMore).toHaveBeenCalledOnce()
  })

  it('moves focus to an end note when the last page lands, and shows nothing otherwise', () => {
    const props = { loadMore: vi.fn(), loadMoreError: null }
    const { rerender } = render(
      <EspressoShotPager {...props} hasMore loadingMore={false} />,
    )
    screen.getByRole('button', { name: 'Load more' }).focus()
    rerender(<EspressoShotPager {...props} hasMore loadingMore />)
    rerender(
      <EspressoShotPager {...props} hasMore={false} loadingMore={false} />,
    )

    const note = screen.getByText('All shots loaded')
    expect(document.activeElement).toBe(note)

    // Once focus moves on, the note goes; without focus there is none.
    fireEvent.blur(note)
    expect(screen.queryByText('All shots loaded')).toBeNull()
    rerender(<EspressoShotPager {...props} hasMore loadingMore={false} />)
    rerender(
      <EspressoShotPager {...props} hasMore={false} loadingMore={false} />,
    )
    expect(screen.queryByText('All shots loaded')).toBeNull()
  })
})
