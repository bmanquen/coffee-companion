import { expect, test } from '@playwright/test'

// Empty-state page tests. Run in the `authed-empty` project (bypass cookie for
// an unseeded user), so every authenticated page renders its empty state.

test('espresso page shows the empty state', async ({ page }) => {
  await page.goto('/espresso')
  await expect(page.getByText('No Espresso Shots Yet')).toBeVisible()
})

test('coffees page shows the empty state', async ({ page }) => {
  await page.goto('/coffees')
  await expect(page.getByText('No Coffees Yet')).toBeVisible()
})

test('equipment page shows empty grinder and device sections', async ({
  page,
}) => {
  await page.goto('/equipment')
  await expect(page.getByRole('heading', { name: 'Equipment' })).toBeVisible()
  // Grinders tab (default) empty state.
  await expect(page.getByText(/No grinders yet/i)).toBeVisible()
  // Brewing Devices empty state lives behind its own tab.
  await page.getByRole('tab', { name: 'Brewing Devices' }).click()
  await expect(page.getByText(/No brewing devices yet/i)).toBeVisible()
})
