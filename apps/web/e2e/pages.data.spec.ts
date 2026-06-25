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
  await expect(page.getByText('Niche Zero')).toBeVisible()
  await expect(page.getByText('Linea Mini')).toBeVisible()
})
