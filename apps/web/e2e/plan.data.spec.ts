import {
  E2E_LIBRARY,
  OFF_SHELF_DIALED_IN_COFFEE,
} from '@coffee-companion/api/db/e2e-library'
import { expect, test } from '@playwright/test'
import { expandRow, rowFor } from './table'

// The granted reading experience, driven in a real browser. Runs in the
// `authed-data` project, whose identity holds a Pro Grant and the same library
// the Free identity holds — so the only thing separating what the two of them
// read is the Grant. The Free half is asserted in plan.free.spec.ts.

test('the whole library is readable, past what the Free Shelf holds', async ({
  page,
}) => {
  await page.goto('/brews')

  // Every Coffee in the library, including the two that would have fallen off
  // a Free Shelf, shows the settings it was brewed with.
  for (const coffee of E2E_LIBRARY) {
    await expect(
      rowFor(page, coffee.name).getByText(coffee.grindSetting, { exact: true }),
    ).toBeVisible()
  }
})

test('no brew reads as Sealed on any feed', async ({ page }) => {
  // Every feed a Brew reaches the screen through, so no screen can hide what
  // another shows. The heading is awaited first: an empty page would otherwise
  // pass for a page with nothing Sealed on it.
  const feeds = [
    { path: '/dashboard', heading: 'Dashboard' },
    { path: '/brews', heading: 'Brews' },
    { path: '/coffees', heading: 'Coffees' },
  ]

  for (const feed of feeds) {
    await page.goto(feed.path)
    await expect(
      page.getByRole('heading', { name: feed.heading }).first(),
    ).toBeVisible()
    await expect(page.getByText(/Sealed/)).toHaveCount(0)
  }
})

test('the Dialed-in settings of an off-Shelf coffee are readable', async ({
  page,
}) => {
  await page.goto('/coffees')

  const table = await expandRow(page, OFF_SHELF_DIALED_IN_COFFEE.name)

  await expect(table.getByText('18g → 36g')).toBeVisible()
})
