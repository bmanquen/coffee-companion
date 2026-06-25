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
