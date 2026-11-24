import { describe, expect, it } from 'vitest'
import { createTestProviders } from './providers'
import { trpcSuccess } from './trpc-response'

describe('trpcSuccess', () => {
  it('reaches the test client with its Dates intact', async () => {
    const createdAt = new Date('2026-05-01T08:00:00.000Z')
    const { queryClient, trpc } = createTestProviders({
      fetch: () => Promise.resolve(trpcSuccess([{ id: 'c1', createdAt }])),
    })

    const coffees = (await queryClient.fetchQuery(
      trpc.coffee.getAll.queryOptions(),
    )) as unknown as Array<{ createdAt: unknown }>

    expect(coffees[0].createdAt).toBeInstanceOf(Date)
    expect(coffees[0].createdAt).toEqual(createdAt)
  })
})
