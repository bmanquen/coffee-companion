import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useBrewingDeviceSelect } from './use-brewing-device-select'
import { createTestProviders } from '@/test/providers'
import { makeBrewingDevice } from '@/test/factories'

const ts = new Date('2026-06-01T08:00:00.000Z')

describe('useBrewingDeviceSelect', () => {
  it('returns only devices of the given type as select options', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(trpc.brewingDevice.list.queryKey(), [
      makeBrewingDevice({
        id: 'd1',
        name: 'V60',
        type: {
          id: 't3',
          userId: null,
          name: 'Pour Over',
          createdAt: ts,
          updatedAt: ts,
        },
      }),
      makeBrewingDevice({
        id: 'd2',
        name: 'Linea Mini',
        type: {
          id: 't1',
          userId: null,
          name: 'Espresso',
          createdAt: ts,
          updatedAt: ts,
        },
      }),
    ])

    const { result } = renderHook(() => useBrewingDeviceSelect('Pour Over'), {
      wrapper: Wrapper,
    })

    expect(result.current.options.map((o) => o.label)).toEqual(['V60'])
    // No createFn passed, so devices are not user-addable on the fly.
    expect(result.current.onAddItem).toBeUndefined()
  })
})
