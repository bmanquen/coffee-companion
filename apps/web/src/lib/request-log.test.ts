// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import {
  REQUEST_ID_HEADER,
  requestId,
  requestRecord,
  withRequestLog,
} from './request-log'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

describe('requestRecord', () => {
  it('records method, path, status, duration, and request id', () => {
    const request = new Request('https://app.test/brews?tab=all&email=a@b.c', {
      method: 'POST',
    })

    expect(requestRecord(request, 201, 42, 'req_1')).toEqual({
      method: 'POST',
      path: '/brews',
      status: 201,
      duration: 42,
      requestId: 'req_1',
    })
  })

  it('skips assets, the favicon, the manifest, and the health check', () => {
    for (const path of [
      '/assets/index-abc123.js',
      '/assets/fonts/inter.woff2',
      '/favicon.ico',
      '/manifest.json',
      '/api/health',
    ]) {
      const request = new Request(`https://app.test${path}`)
      expect(requestRecord(request, 200, 1, 'req_1')).toBeNull()
    }
  })

  it('keeps paths that merely resemble a skipped one', () => {
    for (const path of ['/assets', '/api/health/history', '/health']) {
      const request = new Request(`https://app.test${path}`)
      expect(requestRecord(request, 200, 1, 'req_1')?.path).toBe(path)
    }
  })
})

describe('requestId', () => {
  it('honours an incoming id', () => {
    const request = new Request('https://app.test/', {
      headers: { [REQUEST_ID_HEADER]: 'edge-123' },
    })
    expect(requestId(request)).toBe('edge-123')
  })

  it('generates one when the header is missing or blank', () => {
    expect(requestId(new Request('https://app.test/'))).toMatch(UUID)
    expect(
      requestId(
        new Request('https://app.test/', {
          headers: { [REQUEST_ID_HEADER]: '  ' },
        }),
      ),
    ).toMatch(UUID)
  })
})

describe('withRequestLog', () => {
  function setup(
    inner: (
      request: Request,
      ...rest: Array<unknown>
    ) => Promise<Response> = async () => new Response('ok', { status: 200 }),
  ) {
    const fetch = vi.fn(inner)
    const log = vi.fn()
    const tag = vi.fn()
    const entry = withRequestLog({ fetch }, { log, tag })
    return { entry, fetch, log, tag }
  }

  it('echoes an incoming request id on the response', async () => {
    const { entry, fetch, tag } = setup()
    const request = new Request('https://app.test/brews', {
      headers: { [REQUEST_ID_HEADER]: 'edge-123' },
    })

    const response = await entry.fetch(request)

    expect(response.headers.get(REQUEST_ID_HEADER)).toBe('edge-123')
    expect(fetch.mock.calls[0][0].headers.get(REQUEST_ID_HEADER)).toBe(
      'edge-123',
    )
    expect(tag).toHaveBeenCalledWith('edge-123')
  })

  it('generates an id and passes it down, out, and to the tag hook', async () => {
    const { entry, fetch, log, tag } = setup()

    const response = await entry.fetch(new Request('https://app.test/brews'))

    const id = response.headers.get(REQUEST_ID_HEADER)
    expect(id).toMatch(UUID)
    expect(fetch.mock.calls[0][0].headers.get(REQUEST_ID_HEADER)).toBe(id)
    expect(tag).toHaveBeenCalledWith(id)
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ requestId: id }))
  })

  it('writes one record after the response resolves, with its status', async () => {
    let resolve!: (response: Response) => void
    const { entry, log } = setup(
      () => new Promise<Response>((next) => (resolve = next)),
    )

    const pending = entry.fetch(
      new Request('https://app.test/api/trpc/brews.list?batch=1', {
        method: 'GET',
      }),
    )
    await Promise.resolve()
    expect(log).not.toHaveBeenCalled()

    resolve(new Response(null, { status: 404 }))
    await pending

    expect(log).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith({
      method: 'GET',
      path: '/api/trpc/brews.list',
      status: 404,
      duration: expect.any(Number),
      requestId: expect.stringMatching(UUID),
    })
    expect(Number.isInteger(log.mock.calls[0][0].duration)).toBe(true)
  })

  it('passes extra arguments through to the inner fetch', async () => {
    const { entry, fetch } = setup()
    const opts = { context: {} }

    await entry.fetch(new Request('https://app.test/'), opts)

    expect(fetch.mock.calls[0][1]).toBe(opts)
  })

  it('still stamps the id on a skipped request but writes no record', async () => {
    const { entry, log } = setup()

    const response = await entry.fetch(
      new Request('https://app.test/assets/index-abc.js'),
    )

    expect(response.headers.get(REQUEST_ID_HEADER)).toMatch(UUID)
    expect(log).not.toHaveBeenCalled()
  })

  it('records a 500 and rethrows when the inner fetch throws', async () => {
    const { entry, log } = setup(async () => {
      throw new Error('boom')
    })

    await expect(entry.fetch(new Request('https://app.test/'))).rejects.toThrow(
      'boom',
    )

    expect(log).toHaveBeenCalledWith(expect.objectContaining({ status: 500 }))
  })

  it('adds the header to a response whose headers are immutable', async () => {
    const { entry } = setup(async () => Response.redirect('https://app.test/x'))

    const response = await entry.fetch(new Request('https://app.test/'))

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('https://app.test/x')
    expect(response.headers.get(REQUEST_ID_HEADER)).toMatch(UUID)
  })
})
