import { expect, test } from '@playwright/test'
import { clickUntil } from './helpers'

const SELECTED_DAY = 15
const SELECTED_DAY_NAME = new RegExp(`${SELECTED_DAY}th`)
const NEXT_MONTH_NAME = /Go to the Next Month/i

function dateInNextMonth(day: number): Date {
  const today = new Date()
  return new Date(today.getFullYear(), today.getMonth() + 1, day)
}

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

  await expect(page).toHaveURL(/\/brews\?method=espresso\b/)
  await expect(page.getByRole('heading', { name: 'Brews' })).toBeVisible()
})

// Exercises the DatePicker calendar (Radix popover + react-day-picker) in a
// real browser — roast date lives on the shot form. No coffee is selected, so
// the field isn't prefilled and starts empty.
test('roast-date picker selects a date and closes', async ({ page }) => {
  await page.goto('/espresso/new')

  const fifteenth = page.getByRole('button', { name: SELECTED_DAY_NAME })
  await clickUntil(page.getByText('Pick a date'), fifteenth)
  await fifteenth.click()

  await expect(page.getByText('Pick a date')).toHaveCount(0)
  await expect(page.getByRole('grid')).toHaveCount(0)
  await expect(page.getByLabel('Roast Date')).toBeFocused()
})

test('roast-date picker closes on keyboard select', async ({ page }) => {
  await page.goto('/espresso/new')

  const fifteenth = page.getByRole('button', { name: SELECTED_DAY_NAME })
  await clickUntil(page.getByText('Pick a date'), fifteenth)
  await fifteenth.press('Space')

  await expect(page.getByText('Pick a date')).toHaveCount(0)
  await expect(page.getByRole('grid')).toHaveCount(0)
  await expect(page.getByLabel('Roast Date')).toBeFocused()
})

test('roast-date picker stays open when changing months', async ({ page }) => {
  await page.goto('/espresso/new')

  const fifteenth = page.getByRole('button', { name: SELECTED_DAY_NAME })
  await clickUntil(page.getByText('Pick a date'), fifteenth)
  await page.getByRole('button', { name: NEXT_MONTH_NAME }).click()

  await expect(page.getByRole('grid')).toBeVisible()
  await expect(page.getByText('Pick a date')).toBeVisible()
})

test('roast-date picker keeps a date from another month when that day is tapped again', async ({
  page,
}) => {
  const nextMonthDate = dateInNextMonth(SELECTED_DAY)
  const expectedMonth = nextMonthDate.toLocaleString('en-US', { month: 'long' })
  const expectedYear = String(nextMonthDate.getFullYear())

  await page.goto('/espresso/new')

  const trigger = page.getByLabel('Roast Date')
  const day = page.getByRole('button', { name: SELECTED_DAY_NAME })
  await clickUntil(page.getByText('Pick a date'), day)
  await page.getByRole('button', { name: NEXT_MONTH_NAME }).click()
  await day.click()

  await expect(page.getByRole('grid')).toHaveCount(0)
  await expect(trigger).toContainText(expectedMonth)
  await expect(trigger).toContainText(expectedYear)
  await expect(trigger).toContainText(`${SELECTED_DAY}th`)

  await trigger.click()
  await expect(day).toBeVisible()
  await expect(page.getByText(`${expectedMonth} ${expectedYear}`)).toBeVisible()
  await day.click()

  await expect(page.getByRole('grid')).toHaveCount(0)
  await expect(trigger).toContainText(expectedMonth)
  await expect(trigger).toContainText(expectedYear)
  await expect(trigger).toContainText(`${SELECTED_DAY}th`)
  await expect(trigger).toBeFocused()
})
