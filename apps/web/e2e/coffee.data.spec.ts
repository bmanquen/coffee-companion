import { expect, test } from '@playwright/test'
import { pickOption } from './helpers'
import type { Page } from '@playwright/test'

// The seeded roaster and roast level, chosen before the name is typed. A
// SearchSelect is opened by its visible placeholder, because its label-derived
// a11y name differs from it — and choosing one is the first thing every one of
// these tests does after a navigation, because a click is what survives the
// hydration gap (see clickUntil) and a fill is not: an unhydrated fill reaches
// the DOM, React never hears it, and the form submits an empty name.
async function pickLookups(page: Page) {
  await pickOption(
    page.getByText('Select Roaster'),
    page.getByText('Sey', { exact: true }),
  )
  await pickOption(
    page.getByText('Select Roast Level'),
    page.getByText('Medium', { exact: true }),
  )
}

// Exercises the form components in a real browser end-to-end: the TextField,
// the SearchSelect dropdown (selecting a seeded roaster), and form submission
// through the real create mutation. A unique name keeps retries conflict-free.
test('create a coffee via the new-coffee form', async ({ page }) => {
  const name = `E2E Coffee ${Date.now()}`

  await page.goto('/coffees/new')

  await pickLookups(page)
  await page.getByPlaceholder('Name').fill(name)

  await page.getByRole('button', { name: 'Add', exact: true }).click()

  await expect(page).toHaveURL(/\/coffees$/)
  // .first(): the list renders a desktop table row and a mobile card, so the
  // name appears twice in the DOM.
  await expect(page.getByText(name).first()).toBeVisible()
})

// Edits a coffee through the edit route. Creates its own coffee first (unique
// name) so it never mutates the seeded data other specs depend on.
test('edit a coffee updates its name in the list', async ({ page }) => {
  const name = `E2E Edit ${Date.now()}`
  const updated = `${name} Updated`

  await page.goto('/coffees/new')
  await pickLookups(page)
  await page.getByPlaceholder('Name').fill(name)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page).toHaveURL(/\/coffees$/)
  await expect(page.getByText(name).first()).toBeVisible()

  // Open the edit form from that coffee's desktop table row and rename it.
  const card = page.locator('tr', { hasText: name })
  await card.getByRole('button', { name: 'Edit coffee' }).click()
  await expect(page.getByRole('heading', { name: 'Edit Coffee' })).toBeVisible()

  await page.getByPlaceholder('Name').fill(updated)
  await page.getByRole('button', { name: 'Save' }).click()

  await expect(page).toHaveURL(/\/coffees$/)
  await expect(page.getByText(updated).first()).toBeVisible()
  // The original name no longer appears on its own.
  await expect(page.getByText(name, { exact: true })).toHaveCount(0)
})

// Deletes a coffee via the confirmation dialog. Self-contained: creates the
// coffee it deletes, leaving the shared seed data untouched.
test('delete a coffee removes it from the list', async ({ page }) => {
  const name = `E2E Delete ${Date.now()}`

  await page.goto('/coffees/new')
  await pickLookups(page)
  await page.getByPlaceholder('Name').fill(name)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page).toHaveURL(/\/coffees$/)
  await expect(page.getByText(name).first()).toBeVisible()

  const card = page.locator('tr', { hasText: name })
  await card.getByRole('button', { name: 'Delete coffee' }).click()

  // Confirm in the dialog (its button is named exactly "Delete", distinct from
  // the card trigger's "Delete coffee").
  await page.getByRole('button', { name: 'Delete', exact: true }).click()

  await expect(page.getByText(name)).toHaveCount(0)
})
