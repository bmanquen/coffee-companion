import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

// Runs in the `authed-data` project, which carries the e2e_auth bypass cookie
// (see playwright.config.ts). When authenticated, the home route renders the
// dashboard instead of the landing page.

// The method switcher is a picker: a trigger button whose label is the current
// method, opening a listbox of every method. Open it, then click a row.
function methodTrigger(page: Page, method: string) {
  return page.getByRole('button', { name: method, exact: true })
}
async function pickMethod(page: Page, current: string, next: RegExp) {
  await methodTrigger(page, current).click()
  await page.getByRole('option', { name: next }).click()
}

test('authenticated home renders the dashboard', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Sign in with Google' }),
  ).toHaveCount(0)
})

test('the picker lists every method alphabetically and switches feeds', async ({
  page,
}) => {
  await page.goto('/?method=espresso')

  // Opening the picker lists all five methods alphabetically.
  await methodTrigger(page, 'Espresso').click()
  await expect(page.getByRole('option')).toHaveText([
    /^AeroPress/,
    /^Cold Brew/,
    /^Espresso/,
    /^French Press/,
    /^Pour Over/,
  ])

  // Choosing AeroPress swaps in its feed — the seeded brew's Method Variant
  // shows and the Log button points at /aeropress/new.
  await page.getByRole('option', { name: /AeroPress/ }).click()
  await expect(page.getByText('Standard').first()).toBeVisible()
  await expect(page.getByRole('link', { name: /Log Brew/i })).toHaveAttribute(
    'href',
    '/aeropress/new',
  )

  // Choosing Espresso swaps the feed and its log button back.
  await pickMethod(page, 'AeroPress', /Espresso/)
  await expect(page.getByRole('link', { name: /Log Shot/i })).toHaveAttribute(
    'href',
    '/espresso/new',
  )
})

test('the picker is keyboard-navigable', async ({ page }) => {
  await page.goto('/?method=espresso')

  // Open the picker and drive it entirely from the keyboard: focus lands in the
  // Command, arrow to the next row, Enter to choose it.
  await methodTrigger(page, 'Espresso').click()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')

  // The selection changed via keyboard alone (the trigger no longer reads
  // Espresso) and the URL now carries a method.
  await expect(methodTrigger(page, 'Espresso')).toHaveCount(0)
  await expect(page).toHaveURL(/[?&]method=/)
})

test('deep-linking a method via the URL opens that method', async ({ page }) => {
  // Cold Brew has no seeded data, so the URL param — not recency — is what
  // selects it. The picker trigger reflects the selected method.
  await page.goto('/?method=coldbrew')

  await expect(methodTrigger(page, 'Cold Brew')).toBeVisible()
  await expect(page.getByRole('link', { name: /Log Brew/i })).toHaveAttribute(
    'href',
    '/cold-brew/new',
  )
})

test('choosing a method writes it to the URL', async ({ page }) => {
  await page.goto('/?method=espresso')

  await pickMethod(page, 'Espresso', /Cold Brew/)
  await expect(page).toHaveURL(/[?&]method=coldbrew\b/)
})

test('a reload preserves the selected method', async ({ page }) => {
  await page.goto('/?method=pourover')
  await expect(methodTrigger(page, 'Pour Over')).toBeVisible()

  await page.reload()
  await expect(methodTrigger(page, 'Pour Over')).toBeVisible()
})

test('the back button returns to the previous method', async ({ page }) => {
  await page.goto('/?method=espresso')
  await expect(methodTrigger(page, 'Espresso')).toBeVisible()

  await pickMethod(page, 'Espresso', /Cold Brew/)
  await expect(methodTrigger(page, 'Cold Brew')).toBeVisible()

  await page.goBack()
  await expect(methodTrigger(page, 'Espresso')).toBeVisible()
})
