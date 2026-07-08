import { expect, test } from '@playwright/test'

// Runs in the `authed-data` project, which carries the e2e_auth bypass cookie
// (see playwright.config.ts). When authenticated, the home route renders the
// dashboard instead of the landing page.
test('authenticated home renders the dashboard', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Sign in with Google' }),
  ).toHaveCount(0)
})

test('dashboard shows the dialed-in aeropress section grouped by method', async ({
  page,
}) => {
  await page.goto('/')

  // The seeded dialed-in AeroPress brew renders this section with its method.
  await expect(
    page.getByRole('heading', { name: 'Dialed In AeroPress' }),
  ).toBeVisible()
  await expect(page.getByText('Standard').first()).toBeVisible()
})
