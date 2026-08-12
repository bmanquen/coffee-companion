import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { billingConfig } from './billing'

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
