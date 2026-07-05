import { expect, test } from '@playwright/test'

// Authenticated page smoke tests. Run in the `authed-data` project (bypass
// cookie for the seeded user). The SSR cookie-forwarding fix lets these routes
// load directly via page.goto.

test('espresso page shows the shots table', async ({ page }) => {
  await page.goto('/espresso')
  await expect(page.getByRole('heading', { name: 'Espresso' })).toBeVisible()
  // .first(): the create-espresso flow can add another shot for this coffee,
  // so tolerate more than one row (tests share the seeded user/DB).
  await expect(page.getByText('Ethiopia Guji').first()).toBeVisible()
})

test('coffees page lists coffees', async ({ page }) => {
  await page.goto('/coffees')
  await expect(page.getByRole('heading', { name: 'Coffees' })).toBeVisible()
  await expect(page.getByText('Ethiopia Guji')).toBeVisible()
})

test('equipment page lists grinders and brewing devices', async ({ page }) => {
  await page.goto('/equipment')
  await expect(page.getByRole('heading', { name: 'Equipment' })).toBeVisible()
  // Grinders tab (default) shows the seeded grinder; exact match avoids the
  // mobile card's duplicate "Brand Name" text.
  await expect(page.getByText('Niche Zero', { exact: true })).toBeVisible()
  // The seeded device lives behind the Brewing Devices tab.
  await page.getByRole('tab', { name: 'Brewing Devices' }).click()
  await expect(page.getByText('Linea Mini', { exact: true })).toBeVisible()
})
