import { describe, expect, it, vi } from 'vitest'
import { useSearchSelectResource } from './use-search-select-resource'

describe('useSearchSelectResource', () => {
  it('maps data to value/label options', () => {
    const { options } = useSearchSelectResource([
      { id: '1', name: 'Niche Zero' },
      { id: '2', name: 'DF64' },
    ])
    expect(options).toEqual([
      { value: '1', label: 'Niche Zero' },
      { value: '2', label: 'DF64' },
    ])
  })

  it('omits onAddItem when no createFn is provided', () => {
    const { onAddItem } = useSearchSelectResource([])
    expect(onAddItem).toBeUndefined()
  })

  it('wraps createFn into a value/label option via onAddItem', async () => {
    const createFn = vi.fn(async (name: string) => ({ id: '99', name }))
    const { onAddItem } = useSearchSelectResource([], createFn)

    const result = await onAddItem!('Lagom')

    expect(createFn).toHaveBeenCalledWith('Lagom')
    expect(result).toEqual({ value: '99', label: 'Lagom' })
  })
})
