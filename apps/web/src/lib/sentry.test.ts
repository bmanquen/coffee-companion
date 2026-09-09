import { afterEach, describe, expect, it } from 'vitest'
import {
  isAbortEvent,
  scrubSentryEvent,
  sentryCommonOptions,
  sentryEnabled,
  sentryEnvironment,
  sentryServerDsn,
  trimDsn,
} from './sentry'

describe('trimDsn', () => {
  it('treats blank and whitespace as unset', () => {
    expect(trimDsn(undefined)).toBeUndefined()
    expect(trimDsn('')).toBeUndefined()
    expect(trimDsn('   ')).toBeUndefined()
  })

  it('keeps a real DSN', () => {
    expect(trimDsn(' https://key@o1.ingest.sentry.io/1 ')).toBe(
      'https://key@o1.ingest.sentry.io/1',
    )
  })
})

describe('sentryEnabled', () => {
  it('is off when no DSN is set', () => {
    expect(sentryEnabled(undefined)).toBe(false)
  })

  it('is on when a DSN is set', () => {
    expect(sentryEnabled('https://key@o1.ingest.sentry.io/1')).toBe(true)
  })
})

describe('sentryServerDsn', () => {
  const saved = process.env.SENTRY_DSN

  afterEach(() => {
    if (saved === undefined) delete process.env.SENTRY_DSN
    else process.env.SENTRY_DSN = saved
  })

  it('reads SENTRY_DSN and ignores a blank value', () => {
    delete process.env.SENTRY_DSN
    expect(sentryServerDsn()).toBeUndefined()

    process.env.SENTRY_DSN = '  '
    expect(sentryServerDsn()).toBeUndefined()

    process.env.SENTRY_DSN = 'https://key@o1.ingest.sentry.io/1'
    expect(sentryServerDsn()).toBe('https://key@o1.ingest.sentry.io/1')
  })
})

describe('sentryEnvironment', () => {
  const saved = {
    SENTRY_ENVIRONMENT: process.env.SENTRY_ENVIRONMENT,
    NODE_ENV: process.env.NODE_ENV,
  }

  afterEach(() => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  })

  it('prefers SENTRY_ENVIRONMENT over NODE_ENV', () => {
    process.env.NODE_ENV = 'production'
    process.env.SENTRY_ENVIRONMENT = 'preview'
    expect(sentryEnvironment()).toBe('preview')
  })

  it('falls back to NODE_ENV', () => {
    delete process.env.SENTRY_ENVIRONMENT
    process.env.NODE_ENV = 'test'
    expect(sentryEnvironment()).toBe('test')
  })
})

describe('sentryCommonOptions', () => {
  it('does not send default PII', () => {
    expect(
      sentryCommonOptions('https://key@o1.ingest.sentry.io/1').sendDefaultPii,
    ).toBe(false)
  })
})

describe('isAbortEvent', () => {
  it('drops the aborted fetch WebKit reports after a batch stream drains', () => {
    expect(
      isAbortEvent({
        exception: {
          values: [{ type: 'AbortError', value: 'Fetch is aborted' }],
        },
      }),
    ).toBe(true)
  })

  it('keeps a real failure, and one merely chained onto an abort', () => {
    expect(
      isAbortEvent({
        exception: { values: [{ type: 'TypeError' }] },
      }),
    ).toBe(false)

    expect(
      isAbortEvent({
        exception: { values: [{ type: 'AbortError' }, { type: 'TypeError' }] },
      }),
    ).toBe(false)
  })

  it('keeps an event that carries no exception', () => {
    expect(isAbortEvent({})).toBe(false)
    expect(isAbortEvent({ exception: { values: [] } })).toBe(false)
  })
})

describe('scrubSentryEvent', () => {
  it('keeps a user id and drops email, name, and IP', () => {
    const event = scrubSentryEvent({
      user: {
        id: 'user_123',
        email: 'ada@example.com',
        username: 'Ada',
        ip_address: '203.0.113.8',
      },
    })

    expect(event.user).toEqual({ id: 'user_123' })
  })

  it('drops a user that has no id', () => {
    const event = scrubSentryEvent({
      user: { email: 'ada@example.com' },
    })

    expect(event.user).toBeUndefined()
  })

  it('strips cookies, bodies, and sensitive headers from the request', () => {
    const event = scrubSentryEvent({
      request: {
        cookies: { better_auth: 'session' },
        data: { email: 'ada@example.com', notes: 'private' },
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'better_auth=session',
          Authorization: 'Bearer secret',
          'Stripe-Signature': 't=1,v1=abc',
        },
      },
    })

    expect(event.request).toEqual({
      headers: { 'Content-Type': 'application/json' },
    })
  })

  it('filters secret-shaped extras and leaves Plan tags alone', () => {
    const event = scrubSentryEvent({
      extra: {
        plan: 'free',
        email: 'ada@example.com',
        api_key: 're_123',
        operation: 'planPrices',
      },
    })

    expect(event.extra).toEqual({
      plan: 'free',
      email: '[Filtered]',
      api_key: '[Filtered]',
      operation: 'planPrices',
    })
  })

  it('filters sensitive keys nested in objects and arrays', () => {
    const event = scrubSentryEvent({
      extra: {
        user: { id: 'user_123', email: 'ada@example.com' },
        attempts: [{ token: 'abc', status: 500 }, 'plain'],
        input: { profile: { phone: '555-0100', name: 'Ada' } },
      },
    })

    expect(event.extra).toEqual({
      user: { id: 'user_123', email: '[Filtered]' },
      attempts: [{ token: '[Filtered]', status: 500 }, 'plain'],
      input: { profile: { phone: '[Filtered]', name: 'Ada' } },
    })
  })

  it('scrubs class instances, Errors, Maps, and Sets', () => {
    class Account {
      constructor(
        public id: string,
        public email: string,
      ) {}
    }
    const failure = Object.assign(new Error('boom'), { token: 'abc' })
    const at = new Date('2026-01-01T00:00:00Z')

    const event = scrubSentryEvent({
      extra: {
        account: new Account('user_123', 'ada@example.com'),
        failure,
        headers: new Map([['authorization', 'Bearer x']]),
        secrets: new Set([{ password: 'hunter2' }]),
        at,
      },
    })

    expect(event.extra).toEqual({
      account: { id: 'user_123', email: '[Filtered]' },
      failure: {
        name: 'Error',
        message: 'boom',
        stack: failure.stack,
        token: '[Filtered]',
      },
      headers: { authorization: '[Filtered]' },
      secrets: [{ password: '[Filtered]' }],
      at,
    })
  })

  it('does not loop on self-referencing extras', () => {
    const loop: Record<string, unknown> = { email: 'ada@example.com' }
    loop.self = loop

    const event = scrubSentryEvent({ extra: { loop } })

    expect(event.extra).toEqual({
      loop: { email: '[Filtered]', self: '[Truncated]' },
    })
  })
})
