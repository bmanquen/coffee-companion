import { expect, test } from '@playwright/test'

// The expandable-card system at runtime (behaviours jsdom can't verify: CSS
// breakpoints, tap-to-expand, accordion single-open). Runs under authed-data.
//
// The mobile card stack is the `lg:hidden` container; each card is a bordered
// div. The collapsible detail is a grid-rows wrapper that is 0-height when
// collapsed, so its content is not visible until the card is expanded.
const mobile = { width: 390, height: 900 }
const desktop = { width: 1280, height: 900 }

const mobileCards = 'div.lg\\:hidden > div.rounded-lg.border'

// The collapsible detail region is a grid-rows wrapper that clips to zero height
// when collapsed. Playwright's element visibility ignores ancestor overflow
// clipping, so we measure the region's actual height instead.
const regionHeight = async (card: import('@playwright/test').Locator) => {
  const box = await card.locator('[class*="grid-rows-"]').boundingBox()
  return box?.height ?? 0
}

test.describe('dashboard brew cards', () => {
  test('mobile: card shows a summary and expands its detail on tap', async ({
    page,
  }) => {
    await page.setViewportSize(mobile)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

    const cards = page.locator(mobileCards)
    await expect(cards.first()).toBeVisible()

    // Detail region is collapsed (zero height) until the card is tapped.
    expect(await regionHeight(cards.first())).toBeLessThan(4)
    await expect(cards.first().getByText('Grinder', { exact: false })).toBeAttached()
    await cards.first().click()
    await expect
      .poll(() => regionHeight(cards.first()))
      .toBeGreaterThan(20)
  })

  test('mobile: accordion — opening a card collapses the previously open one', async ({
    page,
  }) => {
    await page.setViewportSize(mobile)
    await page.goto('/')
    const cards = page.locator(mobileCards)
    await expect(cards.first()).toBeVisible()
    test.skip((await cards.count()) < 2, 'needs at least two brews')

    await cards.first().click()
    await expect.poll(() => regionHeight(cards.first())).toBeGreaterThan(20)

    await cards.nth(1).click()
    await expect.poll(() => regionHeight(cards.nth(1))).toBeGreaterThan(20)
    await expect.poll(() => regionHeight(cards.first())).toBeLessThan(4)
  })

  test('desktop: a table row expands into a detail sub-row', async ({ page }) => {
    await page.setViewportSize(desktop)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

    const table = page.locator('div.lg\\:block table')
    await expect(table).toBeVisible()
    // The detail sub-row is always present but collapsed to zero height until
    // its row is clicked (it animates open).
    const region = table.locator('tbody [class*="grid-rows-"]').first()
    expect((await region.boundingBox())?.height ?? 0).toBeLessThan(4)

    await table.locator('tbody tr').first().click()
    await expect.poll(() => region.boundingBox().then((b) => b?.height ?? 0)).toBeGreaterThan(20)
  })
})

test('coffees page: cards live in a panel and expand', async ({ page }) => {
  await page.setViewportSize(mobile)
  await page.goto('/coffees')
  await expect(page.getByRole('heading', { name: 'Coffees' }).first()).toBeVisible()

  const cards = page.locator(mobileCards)
  test.skip((await cards.count()) === 0, 'needs at least one coffee')

  // Process lives in the expander; the detail region is collapsed until tapped.
  await expect(cards.first().getByText('Process', { exact: false })).toBeAttached()
  expect(await regionHeight(cards.first())).toBeLessThan(4)
  await cards.first().click()
  await expect.poll(() => regionHeight(cards.first())).toBeGreaterThan(20)
})
