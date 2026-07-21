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

test('dashboard switches to the AeroPress tab and shows its brew feed', async ({
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

  // Espresso is selected first; its seeded shot's coffee shows.
  await expect(page.getByText('Ethiopia Guji').first()).toBeVisible()

  // Switching to AeroPress swaps in that method's feed — the seeded dialed-in
  // brew renders with its Method Variant and a Log Brew button to /aeropress/new.
  await page.getByRole('tab', { name: 'AeroPress' }).click()
  await expect(page.getByText('Standard').first()).toBeVisible()
  await expect(page.getByRole('link', { name: /Log Brew/i })).toHaveAttribute(
    'href',
    '/aeropress/new',
  )
})
