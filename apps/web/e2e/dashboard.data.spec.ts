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

test('dashboard opens to the most-recent brew’s method and switches tabs', async ({
  page,
}) => {
  await page.goto('/')

  // The method switcher lists all five methods in the agreed order.
  await expect(page.getByRole('tab')).toHaveText([
    'Espresso',
    'Pour Over',
    'French Press',
    'AeroPress',
    'Cold Brew',
  ])

  // The seeded AeroPress brew is logged after the espresso shot, so it's the
  // most recent Brew — the dashboard opens straight to the AeroPress tab, whose
  // feed shows the brew's Method Variant.
  await expect(
    page.getByRole('tab', { name: 'AeroPress', selected: true }),
  ).toBeVisible()
  await expect(page.getByText('Standard').first()).toBeVisible()
  await expect(page.getByRole('link', { name: /Log Brew/i })).toHaveAttribute(
    'href',
    '/aeropress/new',
  )

  // Manual selection still works — switching to Espresso swaps in its feed.
  await page.getByRole('tab', { name: 'Espresso' }).click()
  await expect(page.getByRole('link', { name: /Log Shot/i })).toHaveAttribute(
    'href',
    '/espresso/new',
  )
})
