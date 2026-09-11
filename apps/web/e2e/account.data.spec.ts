import { expect, test } from '@playwright/test'
import { clickUntil } from './helpers'

// Runs in the `authed-data` project, whose identity holds a Pro Grant and no
// Subscription. A subscriber's Manage subscription action stops at the portal
// call in unit tests; the redirect itself is Stripe's, as with Checkout.

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

test('offers an export of account data', async ({ page }) => {
  await page.goto('/account')

  await expect(page.getByRole('button', { name: 'Export data' })).toBeVisible()
})

test('is reachable from the account menu', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/dashboard')

  const accountLink = page.getByRole('link', { name: 'Account' })
  await clickUntil(
    page.getByRole('button', { name: 'Account menu' }),
    accountLink,
  )
  await accountLink.click()

  await expect(page).toHaveURL(/\/account$/)
  await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible()
})
