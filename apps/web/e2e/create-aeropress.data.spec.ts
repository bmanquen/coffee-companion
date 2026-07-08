import { expect, test } from '@playwright/test'

// Covers aeropress/new end-to-end: the coffee SearchSelect (seeded), the
// prefill that fills method + grinder + device from the coffee's most recent
// brew, the number fields, and a real create mutation landing back on /brews.
test('log an aeropress brew via the new-brew form', async ({ page }) => {
  await page.goto('/aeropress/new')

  await page.getByText('Select Coffee').click()
  await page.getByText('Ethiopia Guji', { exact: true }).click()

  // Selecting the coffee prefills method + grinder + device from its most recent
  // brew, replacing the "Select ..." placeholders with the seeded values.
  await expect(page.getByText('Standard', { exact: true })).toBeVisible()
  await expect(page.getByText('Niche Zero', { exact: true })).toBeVisible()
  await expect(page.getByText('AeroPress Go', { exact: true })).toBeVisible()

  await page.getByPlaceholder('15.0').fill('15')
  await page.getByPlaceholder('220').fill('220')

  await page.getByRole('button', { name: 'Log', exact: true }).click()

  await expect(page).toHaveURL(/\/brews$/)
  await expect(page.getByRole('heading', { name: 'Brews' })).toBeVisible()
})
