import { expect, test } from '@playwright/test'
import { clickUntil, expandRow } from './helpers'

// Device-scoped Dialed-in: set / clear from the brew log, then look up by
// method × device on the log form. Another method must not reuse the pair.

test('set, surface, and clear a Dialed-in Brew for espresso × Linea Mini', async ({
  page,
}) => {
  await page.goto('/brews')
  await expect(page.getByRole('heading', { name: 'Brews' })).toBeVisible()

  await expandRow(page, 'Ethiopia Guji')
  const mark = page.getByRole('button', {
    name: 'Mark as dialed in for Linea Mini',
  })
  await clickUntil(
    mark,
    page.getByRole('button', { name: 'Dialed in for Linea Mini — clear' }),
  )

  await page.goto('/espresso/new')
  const coffee = page.getByText('Ethiopia Guji', { exact: true })
  await clickUntil(page.getByText('Select Coffee'), coffee)
  await coffee.click()

  await expect(page.getByText('Linea Mini', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('status', { name: 'Dialed-in for Linea Mini' }),
  ).toBeVisible()
  await expect(page.getByText(/Ethiopia Guji · Dose 18g · Yield 36g/)).toBeVisible()

  await page.goto('/aeropress/new')
  const aeroCoffee = page.getByText('Ethiopia Guji', { exact: true })
  await clickUntil(page.getByText('Select Coffee'), aeroCoffee)
  await aeroCoffee.click()
  await expect(page.getByText('AeroPress Go', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('status', { name: 'Dialed-in for Linea Mini' }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('status', { name: 'Dialed-in for AeroPress Go' }),
  ).toHaveCount(0)

  await page.goto('/brews')
  await expandRow(page, 'Ethiopia Guji')
  await clickUntil(
    page.getByRole('button', { name: 'Dialed in for Linea Mini — clear' }),
    page.getByRole('button', { name: 'Mark as dialed in for Linea Mini' }),
  )

  await page.goto('/espresso/new')
  const coffeeAgain = page.getByText('Ethiopia Guji', { exact: true })
  await clickUntil(page.getByText('Select Coffee'), coffeeAgain)
  await coffeeAgain.click()
  await expect(page.getByText('Linea Mini', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('status', { name: 'Dialed-in for Linea Mini' }),
  ).toHaveCount(0)
})
