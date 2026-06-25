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
