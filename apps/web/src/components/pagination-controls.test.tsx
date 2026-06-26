import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PaginationControls } from './pagination-controls'

describe('PaginationControls', () => {
  it('renders nothing for a single page', () => {
    const { container } = render(
      <PaginationControls page={0} totalPages={1} onPageChange={() => {}} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows the current page and total', () => {
    render(
      <PaginationControls page={1} totalPages={3} onPageChange={() => {}} />,
    )
    expect(screen.getByText('2 of 3')).toBeTruthy()
  })

  it('disables previous on the first page', () => {
    render(
      <PaginationControls page={0} totalPages={3} onPageChange={() => {}} />,
    )
    const [prev, next] = screen.getAllByRole<HTMLButtonElement>('button')
    expect(prev.disabled).toBe(true)
    expect(next.disabled).toBe(false)
  })

  it('disables next on the last page', () => {
    render(
      <PaginationControls page={2} totalPages={3} onPageChange={() => {}} />,
    )
    const [prev, next] = screen.getAllByRole<HTMLButtonElement>('button')
    expect(prev.disabled).toBe(false)
    expect(next.disabled).toBe(true)
  })

  it('calls onPageChange for previous and next', () => {
    const onPageChange = vi.fn()
    render(
      <PaginationControls
        page={1}
        totalPages={3}
        onPageChange={onPageChange}
      />,
    )
    const [prev, next] = screen.getAllByRole<HTMLButtonElement>('button')
    fireEvent.click(prev)
    fireEvent.click(next)
    expect(onPageChange).toHaveBeenNthCalledWith(1, 0)
    expect(onPageChange).toHaveBeenNthCalledWith(2, 2)
  })
})
