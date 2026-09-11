import { describe, expect, it } from 'vitest'
import {
  anonCaller,
  batchedCallerFor,
  callerFor,
  captureLogLines,
  seedUsers,
  uniqFor,
} from '../../test/trpc'
import { createCallerFactory, createTRPCRouter, publicProcedure } from './init'

const USER = 'procedure-log-user'

const asUser = callerFor(USER)
const uniq = uniqFor(USER)

seedUsers([USER])

const lines = captureLogLines()

// A procedure that fails the way a bug does, rather than the way a refusal
// does: nothing here names a tRPC code, so tRPC supplies the one it uses for
// what it could not explain.
const brokenCaller = createCallerFactory(
  createTRPCRouter({
    boom: publicProcedure.query(() => {
      throw new Error('the database fell over')
    }),
  }),
)(() => ({ headers: new Headers() }))

describe('the line a procedure call writes', () => {
  it('names the path, the type, the outcome, the duration, and the request', async () => {
    await asUser.coffee.getAll()

    expect(lines).toEqual([
      {
        level: 'info',
        message: 'procedure',
        fields: {
          path: 'coffee.getAll',
          type: 'query',
          ok: true,
          duration: expect.any(Number),
          requestId: expect.any(String),
          userId: USER,
        },
      },
    ])
  })

  it('names the caller on an authed call and nobody on an anonymous one', async () => {
    await anonCaller.plan.prices()

    expect(lines[0].fields).toEqual({
      path: 'plan.prices',
      type: 'query',
      ok: true,
      duration: expect.any(Number),
      requestId: expect.any(String),
    })
  })

  it('names the tRPC code a refusal carries', async () => {
    await expect(anonCaller.coffee.getAll()).rejects.toThrow(/unauthorized/i)

    expect(lines[0]).toMatchObject({
      level: 'warn',
      fields: { path: 'coffee.getAll', ok: false, code: 'UNAUTHORIZED' },
    })
    expect(lines[0].fields).not.toHaveProperty('userId')
  })

  it('names the caller a refusal was refused to', async () => {
    await expect(
      asUser.planInterest.register({ planId: 'pro' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })

    expect(lines[0]).toMatchObject({
      level: 'warn',
      fields: {
        path: 'planInterest.register',
        type: 'mutation',
        ok: false,
        code: 'BAD_REQUEST',
        userId: USER,
      },
    })
  })

  it('is an error rather than a warning when nothing named the failure', async () => {
    await expect(brokenCaller.boom()).rejects.toThrow(/database fell over/)

    expect(lines[0]).toMatchObject({
      level: 'error',
      fields: { path: 'boom', ok: false, code: 'INTERNAL_SERVER_ERROR' },
    })
  })

  // A mutation is where input and output would leak if anything but the agreed
  // fields were written.
  it('carries no input and no output', async () => {
    await asUser.roaster.create({ name: uniq('Roaster') })

    expect(Object.keys(lines[0].fields).sort()).toEqual([
      'duration',
      'ok',
      'path',
      'requestId',
      'type',
      'userId',
    ])
  })
})

describe('the request a procedure call belongs to', () => {
  it('is one request id for every procedure in a batch', async () => {
    const batched = batchedCallerFor(USER)

    await batched.coffee.getAll()
    await batched.plan.current()

    expect(lines.map((line) => line.fields.path)).toEqual([
      'coffee.getAll',
      'plan.current',
    ])
    expect(lines[0].fields.requestId).toBe(lines[1].fields.requestId)
  })

  it('is a different request id for calls made as separate requests', async () => {
    await asUser.coffee.getAll()
    await asUser.coffee.getAll()

    expect(lines[0].fields.requestId).not.toBe(lines[1].fields.requestId)
  })
})
