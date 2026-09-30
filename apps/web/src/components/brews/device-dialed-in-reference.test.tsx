import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DeviceDialedInReference } from './device-dialed-in-reference'
import { createTestProviders } from '@/test/providers'

const DEVICE = '00000000-0000-4000-8000-000000000005'
const COFFEE = '00000000-0000-4000-8000-000000000001'

const view = {
  coffeeId: COFFEE,
  brewingMethod: 'espresso' as const,
  brewingDeviceId: DEVICE,
  brewId: 'shot-1',
  coffeeName: 'Ethiopia Guji',
  deviceName: 'Linea Mini',
  grindSetting: '21',
  dose: '18',
  outputGrams: '36',
  outputLabel: 'Yield' as const,
  time: 27,
  timeUnit: 's' as const,
  sealed: false,
}

describe('DeviceDialedInReference', () => {
  it('renders nothing when this coffee × method × device has no Dialed-in Brew', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(
      trpc.dialedInBrew.get.queryKey({
        coffeeId: COFFEE,
        brewingMethod: 'espresso',
        brewingDeviceId: DEVICE,
      }),
      [],
    )

    render(
      <DeviceDialedInReference
        coffeeId={COFFEE}
        brewingMethod="espresso"
        brewingDeviceId={DEVICE}
      />,
      { wrapper: Wrapper },
    )
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('surfaces the Dialed-in brew for the given coffee × method × device', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(
      trpc.dialedInBrew.get.queryKey({
        coffeeId: COFFEE,
        brewingMethod: 'espresso',
        brewingDeviceId: DEVICE,
      }),
      [view],
    )

    render(
      <DeviceDialedInReference
        coffeeId={COFFEE}
        brewingMethod="espresso"
        brewingDeviceId={DEVICE}
      />,
      { wrapper: Wrapper },
    )

    expect(
      screen.getByRole('status', { name: 'Dialed-in for Linea Mini' }),
    ).toBeTruthy()
    expect(screen.getByText('Dialed-in for Linea Mini')).toBeTruthy()
    expect(
      screen.getByText(
        'Ethiopia Guji · Grind 21 · Dose 18g · Yield 36g · 1:2 · Time 27s',
      ),
    ).toBeTruthy()
  })

  it('omits the ratio when a weight is missing', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(
      trpc.dialedInBrew.get.queryKey({
        coffeeId: COFFEE,
        brewingMethod: 'espresso',
        brewingDeviceId: DEVICE,
      }),
      [{ ...view, dose: null }],
    )

    render(
      <DeviceDialedInReference
        coffeeId={COFFEE}
        brewingMethod="espresso"
        brewingDeviceId={DEVICE}
      />,
      { wrapper: Wrapper },
    )

    expect(
      screen.getByText('Ethiopia Guji · Grind 21 · Yield 36g · Time 27s'),
    ).toBeTruthy()
    expect(screen.queryByText(/1:/)).toBeNull()
  })

  it('does not query when the coffee or device is empty', () => {
    const { Wrapper } = createTestProviders()
    render(
      <DeviceDialedInReference
        coffeeId=""
        brewingMethod="espresso"
        brewingDeviceId={DEVICE}
      />,
      { wrapper: Wrapper },
    )
    expect(screen.queryByRole('status')).toBeNull()
  })
})
