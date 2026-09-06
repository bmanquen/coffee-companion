import { expect, test } from '@playwright/test'
import { clickUntil } from './helpers'

// Covers aeropress/new end-to-end: the coffee SearchSelect (seeded), the
// prefill that fills method + grinder + device from the coffee's most recent
// brew, the number fields, and a real create mutation landing back on /brews.
test('log an aeropress brew via the new-brew form', async ({ page }) => {
  await page.goto('/aeropress/new')

  const coffee = page.getByText('Ethiopia Guji', { exact: true })
  await clickUntil(page.getByText('Select Coffee'), coffee)
  await coffee.click()

  // Selecting the coffee prefills method + grinder + device from its most recent
  // brew, replacing the "Select ..." placeholders with the seeded values.
  await expect(page.getByText('Standard', { exact: true })).toBeVisible()
  await expect(page.getByText('Niche Zero', { exact: true })).toBeVisible()
  await expect(page.getByText('AeroPress Go', { exact: true })).toBeVisible()

  await page.getByLabel('Dose (g)').fill('15')
  await page.getByLabel('Water (g)').fill('220')
  await page.getByLabel('Steep Time (minutes)').fill('1')
  await page.getByLabel('Steep Time (seconds)').fill('30')
  await page.getByLabel('Grind Setting').fill('18')

  await page.getByRole('button', { name: 'Log', exact: true }).click()

  await expect(page).toHaveURL(/\/brews$/)
  await expect(page.getByRole('heading', { name: 'Brews' })).toBeVisible()
})
