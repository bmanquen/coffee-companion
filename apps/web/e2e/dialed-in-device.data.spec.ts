import { expect, test } from '@playwright/test'
import { clickUntil, desktopTable, waitForHydration } from './helpers'
import type { Locator, Page } from '@playwright/test'

// Device-scoped Dialed-in: set / clear from the brew log, then look up by
// method × device on the log form. Another method must not reuse the pair.

async function expandEthiopiaGujiRow(page: Page): Promise<Locator> {
  const table = desktopTable(page)
  const coffeeRow = table
    .getByRole('row', { name: /Ethiopia Guji/ })
    .filter({
      has: page.getByRole('cell', { name: 'Ethiopia Guji', exact: true }),
    })
    .first()
  const coffeeCell = coffeeRow.getByRole('cell', {
    name: 'Ethiopia Guji',
    exact: true,
  })
  await waitForHydration(coffeeCell)
  await coffeeCell.click()
  // Detail is the next sibling tr — not tbody's first expander (that can be
  // another Linea Mini shot when create-espresso has already logged one).
  const region = coffeeRow.locator('xpath=following-sibling::tr[1]').locator(
    '[class*="grid-rows-"]',
  )
  await expect
    .poll(async () => (await region.boundingBox())?.height ?? 0)
    .toBeGreaterThan(20)
  return region
}

async function setDeviceDialedIn(region: Locator) {
  const clear = region.getByRole('button', {
    name: 'Dialed in for Linea Mini — clear',
  })
  // A prior attempt (or a parallel spec) may already have set this pair.
  if (await clear.isVisible()) return
  await clickUntil(
    region.getByRole('button', { name: 'Mark as dialed in for Linea Mini' }),
    clear,
  )
}

test('set, surface, and clear a Dialed-in Brew for espresso × Linea Mini', async ({
  page,
}) => {
  await page.goto('/brews')
  await expect(page.getByRole('heading', { name: 'Brews' })).toBeVisible()

  const region = await expandEthiopiaGujiRow(page)
  await setDeviceDialedIn(region)

  await page.goto('/espresso/new')
  const coffee = page.getByText('Ethiopia Guji', { exact: true })
  await clickUntil(page.getByText('Select Coffee'), coffee)
  await coffee.click()

  await expect(page.getByText('Linea Mini', { exact: true })).toBeVisible()
  const reference = page.getByRole('status', {
    name: 'Dialed-in for Linea Mini',
  })
  await expect(reference).toBeVisible()
  // Product copy includes grind/time when the marked shot has them (a parallel
  // create-espresso row can be first). Assert the fields, not one regex.
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
  await expect(
    page.getByRole('status', { name: 'Dialed-in for AeroPress Go' }),
  ).toHaveCount(0)

  await page.goto('/brews')
  const regionAgain = await expandEthiopiaGujiRow(page)
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
