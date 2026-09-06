import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { billingConfig, hasLiveSubscription } from './billing'

const retrieve = vi.fn()
const list = vi.fn()
const reportError = vi.hoisted(() => vi.fn())

vi.mock('stripe', () => ({
  default: class {
    prices = { retrieve }
    subscriptions = { list }
  },
}))

vi.mock('./report-error', () => ({ reportError }))

// Every variable these tests touch, so one is never left set for the next.
const vars = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRICE_PRO_MONTHLY',
  'STRIPE_PRICE_PRO_ANNUAL',
]

const configured = {
  STRIPE_SECRET_KEY: 'sk_test_123',
  STRIPE_WEBHOOK_SECRET: 'whsec_123',
  STRIPE_PRICE_PRO_MONTHLY: 'price_monthly123',
  STRIPE_PRICE_PRO_ANNUAL: 'price_annual123',
}

let saved: Record<string, string | undefined>

beforeEach(() => {
  saved = Object.fromEntries(vars.map((name) => [name, process.env[name]]))
  for (const name of vars) delete process.env[name]
})

afterEach(() => {
  for (const name of vars) {
    if (saved[name] === undefined) delete process.env[name]
    else process.env[name] = saved[name]
  }
})

const configure = (overrides: Record<string, string | undefined> = {}) => {
  const env: Record<string, string | undefined> = {
    ...configured,
    ...overrides,
  }
  for (const name of vars) {
    const value = env[name]
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
}

describe('billingConfig', () => {
  it('runs without billing at all when no secret key is set', () => {
    expect(billingConfig()).toBe(null)
  })

  it('describes each sellable Plan by the app’s own identifier', () => {
    configure()

    expect(billingConfig()?.plans).toEqual([
      {
        name: 'pro',
        priceId: 'price_monthly123',
        annualDiscountPriceId: 'price_annual123',
      },
    ])
  })

  it('names every missing variable at once, rather than the first', () => {
    configure({
      STRIPE_WEBHOOK_SECRET: undefined,
      STRIPE_PRICE_PRO_MONTHLY: undefined,
      STRIPE_PRICE_PRO_ANNUAL: undefined,
    })

    expect(() => billingConfig()).toThrow(
      /STRIPE_WEBHOOK_SECRET[\s\S]*STRIPE_PRICE_PRO_MONTHLY[\s\S]*STRIPE_PRICE_PRO_ANNUAL/,
    )
  })

  it('rejects a price identifier that is not one, naming the variable', () => {
    configure({ STRIPE_PRICE_PRO_ANNUAL: 'prod_notAPrice' })

    expect(() => billingConfig()).toThrow(/STRIPE_PRICE_PRO_ANNUAL/)
  })

  it('says how to run without billing, so the fix is not to invent a key', () => {
    configure({ STRIPE_WEBHOOK_SECRET: undefined })

    expect(() => billingConfig()).toThrow(/STRIPE_SECRET_KEY/)
  })
})

describe('planPrices', () => {
  // Re-imported per test, so the module's cache does not carry between them.
  const load = () => import('./billing').then((module) => module.planPrices)

  const price = (unitAmount: number | null, currency = 'usd') => ({
    unit_amount: unitAmount,
    currency,
  })

  beforeEach(() => {
    retrieve.mockReset()
    reportError.mockReset()
    vi.resetModules()
  })

  it('has no prices to advertise when billing is switched off', async () => {
    const planPrices = await load()

    expect(await planPrices()).toBe(null)
  })

  it('reads each sellable Plan’s price in whole currency units', async () => {
    configure()
    retrieve.mockImplementation((id: string) =>
      Promise.resolve(id === 'price_monthly123' ? price(499) : price(4499)),
    )
    const planPrices = await load()

    expect(await planPrices()).toEqual([
      { planId: 'pro', period: 'monthly', amount: 4.99, currency: 'USD' },
      { planId: 'pro', period: 'annual', amount: 44.99, currency: 'USD' },
    ])
  })

  it('leaves a currency with no minor unit whole', async () => {
    configure()
    retrieve.mockResolvedValue(price(500, 'jpy'))
    const planPrices = await load()

    expect((await planPrices())?.[0]).toEqual({
      planId: 'pro',
      period: 'monthly',
      amount: 500,
      currency: 'JPY',
    })
  })

  it('drops a price that has no single amount to advertise', async () => {
    configure()
    retrieve.mockResolvedValue(price(null))
    const planPrices = await load()

    expect(await planPrices()).toEqual([])
  })

  it('asks the provider once, then answers from memory', async () => {
    configure()
    retrieve.mockResolvedValue(price(499))
    const planPrices = await load()

    await planPrices()
    await planPrices()

    // Monthly and annual, from the first call alone.
    expect(retrieve).toHaveBeenCalledTimes(2)
  })

  it('has no prices to advertise when the provider cannot be reached', async () => {
    configure()
    retrieve.mockRejectedValue(new Error('unreachable'))
    const planPrices = await load()

    expect(await planPrices()).toBe(null)
  })

  it('reports the outage so a silent Stripe miss is still visible', async () => {
    configure()
    const error = new Error('unreachable')
    retrieve.mockRejectedValue(error)
    const planPrices = await load()

    await planPrices()

    expect(reportError).toHaveBeenCalledWith(error, {
      area: 'billing',
      operation: 'planPrices',
    })
  })
})

describe('hasLiveSubscription', () => {
  const listing = (...statuses: Array<string>) =>
    list.mockResolvedValue({ data: statuses.map((status) => ({ status })) })

  beforeEach(() => {
    list.mockReset()
  })

  it('finds nothing when billing is switched off', async () => {
    expect(await hasLiveSubscription('cus_123')).toBe(false)
    expect(list).not.toHaveBeenCalled()
  })

  it('asks the provider about that customer', async () => {
    configure()
    listing()

    await hasLiveSubscription('cus_123')

    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_123' }),
    )
  })

  it('finds a Subscription that is being paid for', async () => {
    configure()
    listing('active')

    expect(await hasLiveSubscription('cus_123')).toBe(true)
  })

  // A declined renewal is still a Subscription (ADR-0008); selling another
  // alongside it would have the customer paying twice once the card clears.
  it('finds a Subscription whose renewal is being retried', async () => {
    configure()
    listing('canceled', 'past_due')

    expect(await hasLiveSubscription('cus_123')).toBe(true)
  })

  it('looks past Subscriptions that ended or never started', async () => {
    configure()
    listing('canceled', 'incomplete', 'incomplete_expired', 'unpaid')

    expect(await hasLiveSubscription('cus_123')).toBe(false)
  })

  it('refuses to answer when the provider cannot be reached', async () => {
    configure()
    list.mockRejectedValue(new Error('unreachable'))

    await expect(hasLiveSubscription('cus_123')).rejects.toThrow('unreachable')
  })
})
