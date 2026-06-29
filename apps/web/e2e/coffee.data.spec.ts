import { expect, test } from '@playwright/test'

// Exercises the form components in a real browser end-to-end: the TextField,
// the SearchSelect dropdown (selecting a seeded roaster), and form submission
// through the real create mutation. A unique name keeps retries conflict-free.
test('create a coffee via the new-coffee form', async ({ page }) => {
  const name = `E2E Coffee ${Date.now()}`

  await page.goto('/coffees/new')

  await page.getByPlaceholder('Name').fill(name)

  // SearchSelect: open (its label-derived a11y name differs from the visible
  // text, so target the visible placeholder) and pick the seeded roaster.
  await page.getByText('Select Roaster').click()
  await page.getByText('Sey', { exact: true }).click()

  await page.getByRole('button', { name: 'Add', exact: true }).click()

  await expect(page).toHaveURL(/\/coffees$/)
  await expect(page.getByText(name)).toBeVisible()
})

// Exercises the DatePicker calendar (Radix popover + react-day-picker) in a
// real browser — the one form interaction not otherwise hit by e2e.
test('roast-date picker selects a date', async ({ page }) => {
  await page.goto('/coffees/new')

  await page.getByText('Pick a date').click()
  // Day buttons are labelled by full date (e.g. "Monday, June 15th, 2026");
  // match the 15th of whatever month is shown.
  await page.getByRole('button', { name: /15th/ }).click()

  await expect(page.getByText('Pick a date')).toHaveCount(0)
})

// Edits a coffee through the edit route. Creates its own coffee first (unique
// name) so it never mutates the seeded data other specs depend on.
test('edit a coffee updates its name in the list', async ({ page }) => {
  const name = `E2E Edit ${Date.now()}`
  const updated = `${name} Updated`

  await page.goto('/coffees/new')
  await page.getByPlaceholder('Name').fill(name)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page).toHaveURL(/\/coffees$/)
  await expect(page.getByText(name)).toBeVisible()

  // Open the edit form from that coffee's card and rename it.
  const card = page.locator('[data-slot="card"]', { hasText: name })
  await card.getByRole('button', { name: 'Edit coffee' }).click()
  await expect(page.getByRole('heading', { name: 'Edit Coffee' })).toBeVisible()

  await page.getByPlaceholder('Name').fill(updated)
  await page.getByRole('button', { name: 'Save' }).click()

  await expect(page).toHaveURL(/\/coffees$/)
  await expect(page.getByText(updated)).toBeVisible()
  // The original name no longer appears on its own.
  await expect(page.getByText(name, { exact: true })).toHaveCount(0)
})

// Deletes a coffee via the confirmation dialog. Self-contained: creates the
// coffee it deletes, leaving the shared seed data untouched.
test('delete a coffee removes it from the list', async ({ page }) => {
  const name = `E2E Delete ${Date.now()}`

  await page.goto('/coffees/new')
  await page.getByPlaceholder('Name').fill(name)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page).toHaveURL(/\/coffees$/)
  await expect(page.getByText(name)).toBeVisible()

  const card = page.locator('[data-slot="card"]', { hasText: name })
  await card.getByRole('button', { name: 'Delete coffee' }).click()

  // Confirm in the dialog (its button is named exactly "Delete", distinct from
  // the card trigger's "Delete coffee").
  await page.getByRole('button', { name: 'Delete', exact: true }).click()

  await expect(page.getByText(name)).toHaveCount(0)
})
