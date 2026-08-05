import {
  FREE_GEAR,
  OFF_SHELF_COFFEE,
  OFF_SHELF_DIALED_IN_COFFEE,
  ON_SHELF_COFFEE,
} from '@coffee-companion/api/db/e2e-library'
import { expect, test } from '@playwright/test'
import { expandRow, rowFor } from './table'
import type { Page } from '@playwright/test'

// The Free reading experience, driven in a real browser. Runs in the
// `authed-free` project: the seeded identity holding the shared library with no
// Grant (see playwright.config.ts), so its Shelf holds five Coffees and the
// library's last two have fallen off it.
//
// The granted half of the same library is asserted in plan.data.spec.ts.
//
// These tests are order-independent on purpose — Playwright runs a file's tests
// in parallel, and the last one promotes a Coffee back onto the Shelf. Nothing
// here reads the Coffee that promotion displaces.

// Chooses a form SearchSelect's option, leaving an already-chosen one alone —
// picking the selected option again clears the field. Addressed by id rather
// than by its placeholder, the way the other form specs do, because a prefilled
// SearchSelect shows its value instead of the placeholder.
async function pick(page: Page, field: string, option: string) {
  const trigger = page.locator(`#${field}`)
  if (((await trigger.textContent()) ?? '').includes(option)) return
  await trigger.click()
  await page.getByRole('option', { name: option }).click()
}

test('a coffee off the Shelf reads as Sealed, and says how to reopen it', async ({
  page,
}) => {
  await page.goto('/brews')

  const sealed = rowFor(page, OFF_SHELF_DIALED_IN_COFFEE.name)
  await expect(sealed.getByText(/^Sealed/)).toBeVisible()
  await expect(sealed.getByRole('link', { name: 'Unlock' })).toHaveAttribute(
    'href',
    '/pricing',
  )
  // Still reported as a Brew that exists, without the settings that are the
  // thing being paid for.
  await expect(
    sealed.getByText(OFF_SHELF_DIALED_IN_COFFEE.grindSetting, { exact: true }),
  ).toHaveCount(0)
})

test('the dashboard Seals the same brew the brews list does', async ({
  page,
}) => {
  // Sealing is enforced on the server, but each feed applies it for itself, so
  // the screens are checked separately.
  await page.goto('/dashboard?method=espresso')

  // The feed pages at five, which is exactly the Shelf — so the Sealed brews
  // are never on the first page. Filter to the coffee instead of paging to it.
  await page.getByRole('button', { name: 'All coffees' }).click()
  await page
    .getByRole('option', { name: OFF_SHELF_DIALED_IN_COFFEE.name })
    .click()

  const sealed = rowFor(page, OFF_SHELF_DIALED_IN_COFFEE.name)
  await expect(sealed.getByText(/^Sealed/).first()).toBeVisible()
  await expect(
    sealed.getByText(OFF_SHELF_DIALED_IN_COFFEE.grindSetting, { exact: true }),
  ).toHaveCount(0)
})

test('a coffee on the Shelf stays fully readable', async ({ page }) => {
  await page.goto('/brews')

  const readable = rowFor(page, ON_SHELF_COFFEE.name)
  await expect(
    readable.getByText(ON_SHELF_COFFEE.grindSetting, { exact: true }),
  ).toBeVisible()
  await expect(readable.getByText(/^Sealed/)).toHaveCount(0)
})

test('the Dialed-in settings of an off-Shelf coffee are Sealed too', async ({
  page,
}) => {
  await page.goto('/coffees')

  const table = await expandRow(page, OFF_SHELF_DIALED_IN_COFFEE.name)

  await expect(table.getByText(/This Brew is Sealed/)).toBeVisible()
  await expect(table.getByRole('link', { name: 'See plans' })).toHaveAttribute(
    'href',
    '/pricing',
  )
})

test('an off-Shelf coffee is still loggable, and the new brew reads straight away', async ({
  page,
}) => {
  // A marker unique to this run, so the shot logged here is addressable among
  // whatever else the suite has left behind.
  const grindSetting = `F${Date.now() % 100000}`

  await page.goto('/espresso/new')

  await pick(page, 'coffeeId', OFF_SHELF_COFFEE.name)
  // The form prefills the setup from the coffee's most recent readable shot, so
  // whether these are already filled depends on whether this coffee has been
  // brewed since it fell off the Shelf. Filled either way.
  await pick(page, 'grinderId', FREE_GEAR.grinder)
  await pick(page, 'brewingDeviceId', FREE_GEAR.brewingDevice)

  await page.getByPlaceholder('18.0').fill('18')
  await page.getByPlaceholder('36.0').fill('36')
  await page.getByPlaceholder('e.g. 2.5').fill(grindSetting)

  await page.getByRole('button', { name: 'Log', exact: true }).click()
  await expect(page).toHaveURL(/\/brews$/)

  // The fresh Brew is readable...
  const fresh = rowFor(page, grindSetting)
  await expect(fresh.getByText(grindSetting, { exact: true })).toBeVisible()
  await expect(fresh.getByText(/^Sealed/)).toHaveCount(0)

  // ...while what was Sealed on that coffee stays Sealed.
  await expect(
    rowFor(page, OFF_SHELF_COFFEE.name).filter({ hasText: 'Sealed' }).first(),
  ).toBeVisible()
})
