import { expect, test } from '@playwright/test'
import { eq } from 'drizzle-orm'
import { db } from '@coffee-companion/api/db'
import { user } from '@coffee-companion/api/db/schema'
import { E2E_USER_DELETE } from '@coffee-companion/api/lib/e2e-auth'
import { clickUntil } from './helpers'

test.describe.configure({ mode: 'serial' })

test.beforeEach(async () => {
  await db.delete(user).where(eq(user.id, E2E_USER_DELETE))
  await db.insert(user).values({
    id: E2E_USER_DELETE,
    name: 'E2E Delete Tester',
    email: 'e2e-delete@example.com',
  })
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
  await expect(page.getByRole('heading', { name: 'Restore account' })).toBeVisible()

  await clickUntil(
    page.getByRole('button', { name: 'Restore account' }),
    page.getByRole('heading', { name: 'Dashboard' }),
  )
  await expect(page).toHaveURL(/\/dashboard/)
})
