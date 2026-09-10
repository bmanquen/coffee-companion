import { afterEach, describe, expect, it } from 'vitest'
import {
  isAbortEvent,
  scrubSentryEvent,
  sentryBrowserOptions,
  sentryCommonOptions,
  sentryEnabled,
  sentryEnvironment,
  sentryServerDsn,
  sentryTracesSampleRate,
  traceSampleRate,
  trimSetting,
} from './sentry'

// Restores the named variables after each test in the enclosing describe.
function restoreEnv(...names: Array<string>) {
  const saved = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  )

  afterEach(() => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  })
}

describe('trimSetting', () => {
  it('treats blank and whitespace as unset', () => {
    expect(trimSetting(undefined)).toBeUndefined()
    expect(trimSetting('')).toBeUndefined()
    expect(trimSetting('   ')).toBeUndefined()
  })

  it('keeps a real value', () => {
    expect(trimSetting(' https://key@o1.ingest.sentry.io/1 ')).toBe(
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
  restoreEnv('SENTRY_DSN')

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
  restoreEnv('SENTRY_ENVIRONMENT', 'NODE_ENV')

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

describe('traceSampleRate', () => {
  it('samples everything outside production by default', () => {
    expect(traceSampleRate(undefined, 'development')).toBe(1)
    expect(traceSampleRate(undefined, 'test')).toBe(1)
  })

  it('samples a tenth in production by default', () => {
    expect(traceSampleRate(undefined, 'production')).toBe(0.1)
  })

  it('lets a valid value override the default', () => {
    expect(traceSampleRate('0.25', 'production')).toBe(0.25)
    expect(traceSampleRate(' 0 ', 'development')).toBe(0)
    expect(traceSampleRate('1', 'production')).toBe(1)
  })

  it('falls back when the value is blank', () => {
    expect(traceSampleRate('', 'production')).toBe(0.1)
    expect(traceSampleRate('   ', 'development')).toBe(1)
  })

  it('falls back when the value is not a number', () => {
    expect(traceSampleRate('lots', 'production')).toBe(0.1)
    expect(traceSampleRate('NaN', 'development')).toBe(1)
    expect(traceSampleRate('Infinity', 'development')).toBe(1)
  })

  it('falls back when the value is negative', () => {
    expect(traceSampleRate('-0.5', 'production')).toBe(0.1)
  })

  it('falls back when the value is greater than one', () => {
    expect(traceSampleRate('1.5', 'development')).toBe(1)
    expect(traceSampleRate('10', 'production')).toBe(0.1)
  })
})

describe('sentryTracesSampleRate', () => {
  restoreEnv('SENTRY_TRACES_SAMPLE_RATE', 'SENTRY_ENVIRONMENT')

  it('reads SENTRY_TRACES_SAMPLE_RATE against the Sentry environment', () => {
    process.env.SENTRY_ENVIRONMENT = 'production'
    delete process.env.SENTRY_TRACES_SAMPLE_RATE
    expect(sentryTracesSampleRate()).toBe(0.1)

    process.env.SENTRY_TRACES_SAMPLE_RATE = '0.5'
    expect(sentryTracesSampleRate()).toBe(0.5)

    process.env.SENTRY_TRACES_SAMPLE_RATE = 'nope'
    expect(sentryTracesSampleRate()).toBe(0.1)
  })
})

describe('sentryCommonOptions', () => {
  restoreEnv('SENTRY_TRACES_SAMPLE_RATE', 'SENTRY_ENVIRONMENT')

  it('does not send default PII', () => {
    expect(
      sentryCommonOptions('https://key@o1.ingest.sentry.io/1').sendDefaultPii,
    ).toBe(false)
  })

  it('carries the traces sample rate', () => {
    process.env.SENTRY_ENVIRONMENT = 'production'
    process.env.SENTRY_TRACES_SAMPLE_RATE = '0.2'
    expect(
      sentryCommonOptions('https://key@o1.ingest.sentry.io/1').tracesSampleRate,
    ).toBe(0.2)
  })
})

describe('sentryBrowserOptions', () => {
  restoreEnv('SENTRY_TRACES_SAMPLE_RATE', 'SENTRY_ENVIRONMENT')

  const DSN = 'https://key@o1.ingest.sentry.io/1'

  it('uploads no ordinary session and every session that errors', () => {
    const { init } = sentryBrowserOptions(DSN)

    expect(init.replaysSessionSampleRate).toBe(0)
    expect(init.replaysOnErrorSampleRate).toBe(1)
  })

  it('masks every text node and input, and blocks every image', () => {
    expect(sentryBrowserOptions(DSN).replay).toEqual({
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
    })
  })

  it('carries the common options', () => {
    process.env.SENTRY_ENVIRONMENT = 'production'
    process.env.SENTRY_TRACES_SAMPLE_RATE = '0.2'

    expect(sentryBrowserOptions(DSN).init).toMatchObject(
      sentryCommonOptions(DSN),
    )
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

  it('scrubs a transaction the same way as an error', () => {
    const event = scrubSentryEvent({
      type: 'transaction' as const,
      transaction: '/dashboard',
      user: { id: 'user_123', email: 'ada@example.com' },
      request: {
        cookies: { better_auth: 'session' },
        data: { email: 'ada@example.com' },
        headers: {
          Accept: 'text/html',
          Cookie: 'better_auth=session',
        },
      },
    })

    expect(event).toEqual({
      type: 'transaction',
      transaction: '/dashboard',
      user: { id: 'user_123' },
      request: { headers: { Accept: 'text/html' } },
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
