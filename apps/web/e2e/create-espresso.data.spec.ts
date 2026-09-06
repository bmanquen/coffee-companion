import { expect, test } from '@playwright/test'
import { clickUntil } from './helpers'

// Covers espresso/new end-to-end: the coffee SearchSelect (seeded), the
// prefill that fills grinder + device from the coffee's most recent shot, the
// number fields, and a real create mutation.
test('log an espresso shot via the new-shot form', async ({ page }) => {
  await page.goto('/espresso/new')

  const coffee = page.getByText('Ethiopia Guji', { exact: true })
  await clickUntil(page.getByText('Select Coffee'), coffee)
  await coffee.click()

  // Selecting the coffee prefills grinder + device from its most recent shot,
  // so the "Select Grinder"/"Select Brewing Device" placeholders are replaced.
  await expect(page.getByText('Niche Zero', { exact: true })).toBeVisible()
  await expect(page.getByText('Linea Mini', { exact: true })).toBeVisible()

  await page.getByLabel('Dose (g)').fill('18')
  await page.getByLabel('Yield (g)').fill('36')
  await page.getByLabel('Time (s)').fill('30')
  await page.getByLabel('Grind Setting').fill('1.5')

  await page.getByRole('button', { name: 'Log', exact: true }).click()

  await expect(page).toHaveURL(/\/brews$/)
  await expect(page.getByRole('heading', { name: 'Brews' })).toBeVisible()
})

// Exercises the DatePicker calendar (Radix popover + react-day-picker) in a
// real browser — roast date lives on the shot form. No coffee is selected, so
// the field isn't prefilled and starts empty.
test('roast-date picker selects a date', async ({ page }) => {
  await page.goto('/espresso/new')

  // Day buttons are labelled by full date (e.g. "Monday, June 15th, 2026");
  // match the 15th of whatever month is shown.
  const fifteenth = page.getByRole('button', { name: /15th/ })
  await clickUntil(page.getByText('Pick a date'), fifteenth)
  await fifteenth.click()

  await expect(page.getByText('Pick a date')).toHaveCount(0)
})
