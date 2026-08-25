import { expect, test } from '@playwright/test'
import { clickUntil } from './helpers'

// Navigation's slide-out menu uses a real Radix Sheet, so it's covered here in
// a real browser rather than jsdom. Runs as the authenticated (data) user.
test('nav menu shows the authenticated links', async ({ page }) => {
  await page.goto('/dashboard')

  // The slide-out menu is non-modal, so the page behind it stays in the DOM;
  // match the nav links exactly to avoid colliding with page actions like the
  // dashboard's "Add Coffee" link.
  const coffeeLink = page.getByRole('link', { name: 'Coffee', exact: true })
  await clickUntil(page.getByRole('button', { name: 'Open menu' }), coffeeLink)

  await expect(coffeeLink).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Brews', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Equipment', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign Out' })).toBeVisible()
})
