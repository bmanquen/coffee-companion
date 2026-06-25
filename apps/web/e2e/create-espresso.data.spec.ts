import { expect, test } from '@playwright/test'

// Covers espresso/new end-to-end: three SearchSelects (coffee, grinder,
// espresso device — all seeded) plus number fields and a real create mutation.
test('log an espresso shot via the new-shot form', async ({ page }) => {
  await page.goto('/espresso/new')

  await page.getByText('Select Coffee').click()
  await page.getByText('Ethiopia Guji', { exact: true }).click()

  await page.getByText('Select Grinder').click()
  await page.getByText('Niche Zero', { exact: true }).click()

  await page.getByText('Select Brewing Device').click()
  await page.getByText('Linea Mini', { exact: true }).click()

  await page.getByPlaceholder('18.0').fill('18')
  await page.getByPlaceholder('36.0').fill('36')

  await page.getByRole('button', { name: 'Log', exact: true }).click()

  await expect(page).toHaveURL(/\/espresso$/)
  await expect(page.getByRole('heading', { name: 'Espresso' })).toBeVisible()
})
