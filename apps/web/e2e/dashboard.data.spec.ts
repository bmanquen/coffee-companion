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

test('dashboard switches between method tabs', async ({ page }) => {
  await page.goto('/')

  // The method switcher lists all five methods in the agreed order.
  await expect(page.getByRole('tab')).toHaveText([
    'Espresso',
    'Pour Over',
    'French Press',
    'AeroPress',
    'Cold Brew',
  ])

  // Exactly one tab is selected on load (the dashboard opens to the method of
  // the most-recent Brew — which method that is depends on data other specs in
  // this parallel project may add, so recency selection itself is asserted in
  // the Dashboard component test rather than here).
  await expect(page.getByRole('tab', { selected: true })).toHaveCount(1)

  // Selecting AeroPress swaps in its feed — the seeded brew's Method Variant
  // shows and the Log button points at /aeropress/new.
  await page.getByRole('tab', { name: 'AeroPress' }).click()
  await expect(page.getByText('Standard').first()).toBeVisible()
  await expect(page.getByRole('link', { name: /Log Brew/i })).toHaveAttribute(
    'href',
    '/aeropress/new',
  )

  // Selecting Espresso swaps the feed and its log button back.
  await page.getByRole('tab', { name: 'Espresso' }).click()
  await expect(page.getByRole('link', { name: /Log Shot/i })).toHaveAttribute(
    'href',
    '/espresso/new',
  )
})
