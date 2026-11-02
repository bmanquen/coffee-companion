import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  assertOneRegion,
  locatorFrom,
  requireUniqueRegion,
  resolveClickTarget,
} from './control.mjs'

function mockLocator(label, trail, { countValue = 1 } = {}) {
  const locator = {
    label,
    trail,
    first() {
      trail.push('first')
      return mockLocator(`${label}.first()`, trail, { countValue })
    },
    getByRole(role, opts) {
      trail.push(['getByRole', role, opts])
      return mockLocator(`${label}.getByRole(${role})`, trail, { countValue })
    },
    getByPlaceholder(placeholder, opts) {
      trail.push(['getByPlaceholder', placeholder, opts])
      return mockLocator(`${label}.getByPlaceholder(${placeholder})`, trail, {
        countValue,
      })
    },
    getByLabel(labelName, opts) {
      trail.push(['getByLabel', labelName, opts])
      return mockLocator(`${label}.getByLabel(${labelName})`, trail, {
        countValue,
      })
    },
    getByText(text, opts) {
      trail.push(['getByText', text, opts])
      return mockLocator(`${label}.getByText(${text})`, trail, { countValue })
    },
    async count() {
      trail.push(['count', countValue])
      return countValue
    },
    async waitFor(opts) {
      trail.push(['waitFor', opts])
    },
  }
  return locator
}

function pageWithTrail(countValue = 1) {
  const trail = []
  return { page: mockLocator('page', trail, { countValue }), trail }
}

describe('locatorFrom', () => {
  it('scopes a button click to the row whose name contains the unique gear', () => {
    const { page, trail } = pageWithTrail()
    locatorFrom(page, {
      role: 'button',
      name: 'Edit grinder',
      row: 'E2E Grinder unique',
    })
    assert.deepEqual(trail, [
      ['getByRole', 'row', { name: 'E2E Grinder unique' }],
      ['getByRole', 'button', { name: 'Edit grinder', exact: false }],
    ])
    assert.ok(!trail.includes('first'))
  })

  it('applies .first() on a placeholder fill', () => {
    const { page, trail } = pageWithTrail()
    locatorFrom(page, { placeholder: 'Name', first: true })
    assert.deepEqual(trail, [
      ['getByPlaceholder', 'Name', { exact: false }],
      'first',
    ])
  })

  it('does not apply .first() on a placeholder fill unless asked', () => {
    const { page, trail } = pageWithTrail()
    locatorFrom(page, { placeholder: 'Name' })
    assert.deepEqual(trail, [['getByPlaceholder', 'Name', { exact: false }]])
  })

  it('scopes an exact country/region cell and takes the first match', () => {
    const { page, trail } = pageWithTrail()
    locatorFrom(page, {
      role: 'cell',
      name: 'Ethiopia',
      exact: true,
      first: true,
    })
    assert.deepEqual(trail, [
      ['getByRole', 'cell', { name: 'Ethiopia', exact: true }],
      'first',
    ])
  })

  it('scopes a header click to the named navigation', () => {
    const { page, trail } = pageWithTrail()
    locatorFrom(page, {
      role: 'link',
      name: 'Pricing',
      nav: 'Marketing',
    })
    assert.deepEqual(trail, [
      ['getByRole', 'navigation', { name: 'Marketing' }],
      ['getByRole', 'link', { name: 'Pricing', exact: false }],
    ])
  })

  it('coerces a regex name on the nav path the same way as other role clicks', () => {
    const { page, trail } = pageWithTrail()
    locatorFrom(page, {
      role: 'link',
      name: '/pricing/i',
      nav: 'Marketing',
    })
    assert.deepEqual(trail, [
      ['getByRole', 'navigation', { name: 'Marketing' }],
      ['getByRole', 'link', { name: /pricing/i, exact: false }],
    ])
  })

  it('scopes text to the named region', () => {
    const { page, trail } = pageWithTrail()
    locatorFrom(page, {
      region: 'Apple',
      text: '/revoked immediately/i',
    })
    assert.deepEqual(trail, [
      ['getByRole', 'region', { name: 'Apple' }],
      ['getByText', /revoked immediately/i, { exact: false }],
    ])
  })

  it('scopes a role name to the named region', () => {
    const { page, trail } = pageWithTrail()
    locatorFrom(page, {
      region: 'Apple',
      role: 'heading',
      name: 'Apple',
      exact: true,
    })
    assert.deepEqual(trail, [
      ['getByRole', 'region', { name: 'Apple' }],
      ['getByRole', 'heading', { name: 'Apple', exact: true }],
    ])
  })
})

describe('requireUniqueRegion', () => {
  it('accepts a single named region and waits for it', async () => {
    const { page, trail } = pageWithTrail(1)
    await requireUniqueRegion(page, { region: 'Apple' })
    assert.deepEqual(trail, [
      ['getByRole', 'region', { name: 'Apple' }],
      ['count', 1],
      ['waitFor', { state: 'visible', timeout: 15_000 }],
    ])
  })

  it('fails when the named region is missing so --count 0 cannot pass', async () => {
    const { page } = pageWithTrail(0)
    await assert.rejects(
      () => requireUniqueRegion(page, { region: 'Apple' }, { timeoutMs: 0 }),
      /matched 0 times; expected 1/,
    )
    assert.throws(() => assertOneRegion(0, 'Apple'), /matched 0 times; expected 1/)
  })

  it('fails when the named region is not unique', async () => {
    const { page } = pageWithTrail(2)
    await assert.rejects(
      () => requireUniqueRegion(page, { region: 'Apple' }, { timeoutMs: 0 }),
      /matched 2 times; expected 1/,
    )
  })
})

describe('resolveClickTarget', () => {
  it('requires a unique region before resolving a scoped click', async () => {
    const { page, trail } = pageWithTrail(1)
    await resolveClickTarget(page, {
      region: 'Apple',
      role: 'link',
      name: 'Learn more',
    })
    assert.deepEqual(trail, [
      ['getByRole', 'region', { name: 'Apple' }],
      ['count', 1],
      ['waitFor', { state: 'visible', timeout: 15_000 }],
      ['getByRole', 'region', { name: 'Apple' }],
      ['getByRole', 'link', { name: 'Learn more', exact: false }],
    ])
    assert.ok(!trail.includes('first'))
  })

  it('fails a scoped click when the named region is not unique, before --first', async () => {
    const { page, trail } = pageWithTrail(2)
    await assert.rejects(
      () =>
        resolveClickTarget(page, {
          region: 'Apple',
          role: 'link',
          name: 'Learn more',
          first: true,
        }),
      /matched 2 times; expected 1/,
    )
    assert.deepEqual(trail, [
      ['getByRole', 'region', { name: 'Apple' }],
      ['count', 2],
    ])
  })
})
