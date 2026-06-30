import { expect, test } from '@playwright/test'

// Covers the grinder create form. Unique names keep retries conflict-free
// (grinders are unique per user).

test('create a grinder via the new-grinder form', async ({ page }) => {
  const name = `E2E Grinder ${Date.now()}`
  await page.goto('/equipment/grinders/new')

  await page.getByPlaceholder('e.g. Niche Zero').fill(name)
  await page.getByPlaceholder('e.g. Niche', { exact: true }).fill('Test Brand')
  await page.getByRole('button', { name: 'Add', exact: true }).click()

  await expect(page).toHaveURL(/\/equipment$/)
  await expect(page.getByText(name)).toBeVisible()
})
