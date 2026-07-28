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

  // The chrome hangs off the authenticated layout, so a logged-out visitor
  // never mounts it. The mobile header and the drawer trigger are the ones that
  // bite here — the bottom tab bar hides itself without a session anyway.
  await expect(page.getByRole('banner')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Open menu' })).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(0)
})
