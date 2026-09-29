import { expect, test } from '@playwright/test'
import { clickUntil, desktopTable, waitForHydration } from './helpers'
import type { Locator, Page } from '@playwright/test'

// Dialed-in membership: set / clear from the brew log row, then look up by
// coffee × method × device on the log form. Another method must not reuse
// the espresso set.

async function ethiopiaGujiRow(page: Page): Promise<Locator> {
  const table = desktopTable(page)
  const coffeeRow = table
    .getByRole('row', { name: /Ethiopia Guji/ })
    .filter({
      has: page.getByRole('cell', { name: 'Ethiopia Guji', exact: true }),
    })
    .first()
  await waitForHydration(
    coffeeRow.getByRole('cell', { name: 'Ethiopia Guji', exact: true }),
  )
  return coffeeRow
}

async function markEthiopiaGuji(row: Locator) {
  const clear = row.getByRole('button', {
    name: 'Dialed in Ethiopia Guji — clear',
  })
  if (await clear.isVisible()) return
  await clickUntil(
    row.getByRole('button', { name: 'Mark Ethiopia Guji as dialed in' }),
    clear,
  )
}

test('set, surface, and clear Dialed-in for espresso × Linea Mini', async ({
  page,
}) => {
  await page.goto('/brews')
  await expect(page.getByRole('heading', { name: 'Brews' })).toBeVisible()

  const row = await ethiopiaGujiRow(page)
  await markEthiopiaGuji(row)

  await page.goto('/espresso/new')
  const coffee = page.getByText('Ethiopia Guji', { exact: true })
  await clickUntil(page.getByText('Select Coffee'), coffee)
  await coffee.click()

  await expect(page.getByText('Linea Mini', { exact: true })).toBeVisible()
  const reference = page.getByRole('status', {
    name: 'Dialed-in for Linea Mini',
  })
  await expect(reference).toBeVisible()
  await expect(reference).toContainText('Ethiopia Guji')
  await expect(reference).toContainText('Dose 18g')
  await expect(reference).toContainText('Yield 36g')

  await page.goto('/aeropress/new')
  const aeroCoffee = page.getByText('Ethiopia Guji', { exact: true })
  await clickUntil(page.getByText('Select Coffee'), aeroCoffee)
  await aeroCoffee.click()
  await expect(page.getByText('AeroPress Go', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('status', { name: 'Dialed-in for Linea Mini' }),
  ).toHaveCount(0)

  await page.goto('/brews')
  const rowAgain = await ethiopiaGujiRow(page)
  await clickUntil(
    rowAgain.getByRole('button', {
      name: 'Dialed in Ethiopia Guji — clear',
    }),
    rowAgain.getByRole('button', {
      name: 'Mark Ethiopia Guji as dialed in',
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
