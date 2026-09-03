import { expect, test } from '@playwright/test'

// Account settings for the granted user. Runs in the `authed-data` project,
// whose identity holds a Pro Grant and no Subscription — so the Plan is Pro,
// but there is no Stripe customer for a billing portal to open for. The page
// must say so rather than offer a link that can only break.
//
// A subscriber's Manage subscription action is exercised in unit tests up to
// the portal call; the redirect itself is Stripe's, as with Checkout.

test('shows the Plan a Grant confers, with nothing to manage', async ({
  page,
}) => {
  await page.goto('/account')

  await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible()
  await expect(page.getByText('Pro', { exact: true })).toBeVisible()

  await expect(
    page.getByRole('button', { name: 'Manage subscription' }),
  ).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'See plans' })).toHaveAttribute(
    'href',
    '/pricing',
  )
})

test('is reachable from the account menu', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/dashboard')

  await page.getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('link', { name: 'Account' }).click()

  await expect(page).toHaveURL(/\/account$/)
  await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible()
})
