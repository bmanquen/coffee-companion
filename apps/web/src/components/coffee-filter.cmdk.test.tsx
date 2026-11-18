import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { CoffeeFilter } from '@/components/coffee-filter'

// Real cmdk, which needs these two browser APIs jsdom lacks.
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Element.prototype.scrollIntoView = () => {}
})

const options = [
  { value: 'guji-1', label: 'Ethiopia Guji' },
  { value: 'guji-2', label: 'Ethiopia Guji' },
  { value: 'huila', label: 'Colombia Huila' },
]

async function openFilter(onChange: (value: string) => void) {
  render(<CoffeeFilter options={options} value="" onChange={onChange} />)
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'All coffees' }))
  })
  return screen.getByPlaceholderText('Search coffees...')
}

describe('CoffeeFilter with cmdk', () => {
  it('selects the second of two same-named coffees from the keyboard', async () => {
    const onChange = vi.fn()
    const input = await openFilter(onChange)
    for (const key of ['ArrowDown', 'ArrowDown', 'Enter']) {
      await act(async () => {
        fireEvent.keyDown(input, { key })
      })
    }
    expect(onChange).toHaveBeenCalledWith('guji-2')
  })

  it('searches coffees by label, not by id', async () => {
    const input = await openFilter(vi.fn())
    await act(async () => {
      fireEvent.change(input, { target: { value: 'huila' } })
    })
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Colombia Huila',
    ])
    await act(async () => {
      fireEvent.change(input, { target: { value: 'guji-2' } })
    })
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })
})
