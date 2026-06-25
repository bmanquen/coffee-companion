import { expect, test } from '@playwright/test'

// Navigation's slide-out menu uses a real Radix Sheet, so it's covered here in
// a real browser rather than jsdom. Runs as the authenticated (data) user.
test('nav menu shows the authenticated links', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Open menu' }).click()

  await expect(page.getByRole('link', { name: 'Coffees' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Espresso' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Equipment' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign Out' })).toBeVisible()
})
