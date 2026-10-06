import { describe, expect, it } from 'vitest'
import {
  callerFor,
  captureLogLines,
  seedUsers,
  uniqFor,
} from '../../test/trpc'

const ALICE = 'lookup-trpc-alice'
const BOB = 'lookup-trpc-bob'
const alice = callerFor(ALICE)
const bob = callerFor(BOB)
const uniq = uniqFor(ALICE)
const lines = captureLogLines()

seedUsers([ALICE, BOB])

describe('lookup create procedures', () => {
  it('names the saved own casing as CONFLICT', async () => {
    const saved = uniq('Onyx Test')
    await alice.roaster.create({ name: saved })
    await expect(
      alice.roaster.create({ name: saved.toLowerCase() }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: `You already have one called ${saved}. Pick it there, or give this one a different name.`,
    })
  })

  it('names a shared default that was already in the list', async () => {
    const saved = uniq('Inverted')
    const { db } = await import('../db')
    const { roasters } = await import('../db/schema')
    await db.insert(roasters).values({ name: saved })
    await expect(
      alice.roaster.create({ name: saved.toLowerCase() }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: `${saved} is already in the list. Pick it there, or give yours a different name.`,
    })
    expect(lines[lines.length - 1]).toMatchObject({
      level: 'warn',
      fields: { path: 'roaster.create', ok: false, code: 'CONFLICT' },
    })
  })

  it('lets a second user keep the same name', async () => {
    const saved = uniq('Kaffa Lab')
    await alice.roaster.create({ name: saved })
    await expect(
      bob.roaster.create({ name: saved.toLowerCase() }),
    ).resolves.toMatchObject({ name: saved.toLowerCase(), userId: BOB })
  })

  it('compares a region only within its country', async () => {
    const countryA = await alice.country.create({ name: uniq('Colombia') })
    const countryB = await alice.country.create({ name: uniq('Peru') })
    const saved = uniq('Huila')
    await alice.region.create({ name: saved, countryId: countryA.id })
    await alice.region.create({ name: saved, countryId: countryB.id })
    await expect(
      alice.region.create({
        name: saved.toLowerCase(),
        countryId: countryA.id,
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: `You already have one called ${saved}. Pick it there, or give this one a different name.`,
    })
  })

  it('stamps the session user even when the client sends another id', async () => {
    const country = await alice.country.create({ name: uniq('SessionCountry') })
    const creates: Array<() => Promise<{ userId: string | null }>> = [
      () => alice.country.create({ name: uniq('C'), userId: null } as never),
      () =>
        alice.country.create({ name: uniq('C'), userId: BOB } as never),
      () =>
        alice.region.create({
          name: uniq('R'),
          countryId: country.id,
          userId: null,
        } as never),
      () =>
        alice.region.create({
          name: uniq('R'),
          countryId: country.id,
          userId: BOB,
        } as never),
      () =>
        alice.roastLevel.create({ name: uniq('L'), userId: null } as never),
      () =>
        alice.roastLevel.create({ name: uniq('L'), userId: BOB } as never),
      () => alice.roaster.create({ name: uniq('Ro'), userId: null } as never),
      () => alice.roaster.create({ name: uniq('Ro'), userId: BOB } as never),
      () =>
        alice.coffeeProcess.create({ name: uniq('P'), userId: null } as never),
      () =>
        alice.coffeeProcess.create({ name: uniq('P'), userId: BOB } as never),
      () =>
        alice.brewingDeviceType.create({
          name: uniq('T'),
          userId: null,
        } as never),
      () =>
        alice.brewingDeviceType.create({
          name: uniq('T'),
          userId: BOB,
        } as never),
      () =>
        alice.aeropressMethod.create({
          name: uniq('A'),
          userId: null,
        } as never),
      () =>
        alice.aeropressMethod.create({
          name: uniq('A'),
          userId: BOB,
        } as never),
      () =>
        alice.pouroverMethod.create({
          name: uniq('O'),
          userId: null,
        } as never),
      () =>
        alice.pouroverMethod.create({
          name: uniq('O'),
          userId: BOB,
        } as never),
      () =>
        alice.frenchpressMethod.create({
          name: uniq('F'),
          userId: null,
        } as never),
      () =>
        alice.frenchpressMethod.create({
          name: uniq('F'),
          userId: BOB,
        } as never),
    ]
    for (const create of creates) {
      expect((await create()).userId).toBe(ALICE)
    }
  })
})
