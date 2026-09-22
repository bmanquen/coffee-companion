import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { locatorFrom } from './control.mjs'

function mockLocator(label, trail) {
  const locator = {
    label,
    trail,
    first() {
      trail.push('first')
      return mockLocator(`${label}.first()`, trail)
    },
    getByRole(role, opts) {
      trail.push(['getByRole', role, opts])
      return mockLocator(`${label}.getByRole(${role})`, trail)
    },
    getByPlaceholder(placeholder, opts) {
      trail.push(['getByPlaceholder', placeholder, opts])
      return mockLocator(`${label}.getByPlaceholder(${placeholder})`, trail)
    },
    getByLabel(labelName, opts) {
      trail.push(['getByLabel', labelName, opts])
      return mockLocator(`${label}.getByLabel(${labelName})`, trail)
    },
    getByText(text, opts) {
      trail.push(['getByText', text, opts])
      return mockLocator(`${label}.getByText(${text})`, trail)
    },
  }
  return locator
}

function pageWithTrail() {
  const trail = []
  return { page: mockLocator('page', trail), trail }
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
})
