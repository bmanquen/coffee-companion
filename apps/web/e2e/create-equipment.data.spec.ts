import { expect, test } from '@playwright/test'

// Covers the equipment create forms. Unique names keep retries conflict-free
// (grinders/devices are unique per user).

test('create a grinder via the new-grinder form', async ({ page }) => {
  const name = `E2E Grinder ${Date.now()}`
  await page.goto('/equipment/grinders/new')

  await page.getByPlaceholder('e.g. Niche Zero').fill(name)
  await page.getByPlaceholder('e.g. Niche', { exact: true }).fill('Test Brand')
  await page.getByRole('button', { name: 'Add', exact: true }).click()

  await expect(page).toHaveURL(/\/equipment$/)
  await expect(page.getByText(name)).toBeVisible()
})

test('create a brewing device via the new-device form', async ({ page }) => {
  const name = `E2E Device ${Date.now()}`
  await page.goto('/equipment/brewing-devices/new')

  await page.getByPlaceholder('e.g. Linea Mini').fill(name)
  await page.getByPlaceholder('e.g. La Marzocco').fill('Test Brand')

  // Type SearchSelect — pick the seeded Espresso type.
  await page.getByText('Select Type').click()
  await page.getByText('Espresso', { exact: true }).click()

  await page.getByRole('button', { name: 'Add', exact: true }).click()

  await expect(page).toHaveURL(/\/equipment$/)
  await expect(page.getByText(name)).toBeVisible()
})
