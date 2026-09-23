import { expect, test } from '@playwright/test'
import { clickUntil, desktopTable, waitForHydration } from './helpers'

// Device-scoped Dialed-in: set / clear from the brew log, then look up by
// method × device on the log form. Another method must not reuse the pair.

async function expandFirstEspressoRow(page: Parameters<typeof desktopTable>[0]) {
  const table = desktopTable(page)
  const coffeeCell = table
    .getByRole('row', { name: /Ethiopia Guji/ })
    .getByRole('cell', { name: 'Ethiopia Guji', exact: true })
    .first()
  await waitForHydration(coffeeCell)
  await coffeeCell.click()
  const region = table.locator('tbody [class*="grid-rows-"]').first()
  await expect
    .poll(async () => (await region.boundingBox())?.height ?? 0)
    .toBeGreaterThan(20)
  return region
}

test('set, surface, and clear a Dialed-in Brew for espresso × Linea Mini', async ({
  page,
}) => {
  await page.goto('/brews')
  await expect(page.getByRole('heading', { name: 'Brews' })).toBeVisible()

  const region = await expandFirstEspressoRow(page)
  await clickUntil(
    region.getByRole('button', { name: 'Mark as dialed in for Linea Mini' }),
    region.getByRole('button', { name: 'Dialed in for Linea Mini — clear' }),
  )

  await page.goto('/espresso/new')
  const coffee = page.getByText('Ethiopia Guji', { exact: true })
  await clickUntil(page.getByText('Select Coffee'), coffee)
  await coffee.click()

  await expect(page.getByText('Linea Mini', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('status', { name: 'Dialed-in for Linea Mini' }),
  ).toBeVisible()
  await expect(
    page.getByText(/Ethiopia Guji · Dose 18g · Yield 36g/),
  ).toBeVisible()

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
  const regionAgain = await expandFirstEspressoRow(page)
  await clickUntil(
    regionAgain.getByRole('button', {
      name: 'Dialed in for Linea Mini — clear',
    }),
    regionAgain.getByRole('button', {
      name: 'Mark as dialed in for Linea Mini',
    }),
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
