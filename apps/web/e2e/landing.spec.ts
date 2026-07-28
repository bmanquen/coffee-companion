import { expect, test } from '@playwright/test'

test('unauthenticated landing page renders the sign-in call to action', async ({
  page,
}) => {
  await page.goto('/')

  await expect(
    page.getByRole('heading', { name: 'Coffee Companion' }),
  ).toBeVisible()
  await expect(
    page.getByText('Track your coffees and dial in your espresso.'),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Sign in with Google' }),
  ).toBeVisible()
})

test('the public root renders none of the signed-in app chrome', async ({
  page,
}) => {
  await page.goto('/')

  // The chrome now hangs off the authenticated layout, so a logged-out visitor
  // never mounts it. Previously the mobile header and the drawer trigger both
  // rendered here regardless of session.
  await expect(page.getByRole('banner')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Open menu' })).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(0)
})
