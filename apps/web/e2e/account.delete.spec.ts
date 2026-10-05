import { expect, test } from '@playwright/test'
import { resetE2eDeleteUser } from '@coffee-companion/api/db/seed-e2e'
import { clickUntil } from './helpers'

test.describe.configure({ mode: 'serial' })

test.beforeEach(async () => {
  await resetE2eDeleteUser()
})

test('deleting offers restore, blocks the app, and restore brings the account back', async ({
  page,
}) => {
  await page.goto('/account')
  await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible()

  await clickUntil(
    page.getByRole('button', { name: 'Delete account' }),
    page.getByRole('dialog'),
  )
  await clickUntil(
    page.getByRole('dialog').getByRole('button', { name: 'Delete account' }),
    page.getByRole('heading', { name: 'Restore account' }),
  )

  await expect(
    page.getByText(/Your Subscription stays cancelled/),
  ).toBeVisible()
  await expect(
    page.getByText(/does not start a new one.*still not refunded/i),
  ).toBeVisible()

  await page.goto('/coffees')
  await expect(page).toHaveURL(/\/restore-account$/)
  await expect(
    page.getByRole('heading', { name: 'Restore account' }),
  ).toBeVisible()

  await clickUntil(
    page.getByRole('button', { name: 'Restore account' }),
    page.getByRole('heading', { name: 'Dashboard' }),
  )
  await expect(page).toHaveURL(/\/dashboard/)
})
