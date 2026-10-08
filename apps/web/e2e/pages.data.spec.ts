import { expect, test } from '@playwright/test'
import { clickUntil, pickBrewsMethod } from './helpers'

// Authenticated page smoke tests. Run in the `authed-data` project (bypass
// cookie for the seeded user). The SSR cookie-forwarding fix lets these routes
// load directly via page.goto.

test('brews page shows the espresso log', async ({ page }) => {
  await page.goto('/brews')
  await expect(page.getByRole('heading', { name: 'Brews' })).toBeVisible()
  // Espresso is selected by default (no ?method=).
  // .first(): the create-espresso flow can add another shot for this coffee,
  // so tolerate more than one row (tests share the seeded user/DB).
  await expect(page.getByText('Ethiopia Guji').first()).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Brewing method Espresso' }),
  ).toBeVisible()
  await expect(page.getByRole('tab')).toHaveCount(0)
})

test('brews page AeroPress method shows the aeropress log', async ({
  page,
}) => {
  await page.goto('/brews')
  // The seeded dialed-in AeroPress brew for Ethiopia Guji, on the Standard
  // method. Gate on Standard, not on the coffee: Ethiopia Guji is on the
  // default Espresso log too, so it would not show the method had switched.
  const method = page.getByText('Standard').first()
  await pickBrewsMethod(page, 'AeroPress')
  await expect(method).toBeVisible()
  await expect(page.getByText('Ethiopia Guji').first()).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Brewing method AeroPress' }),
  ).toBeFocused()
  await expect(page).toHaveURL(/[?&]method=aeropress\b/)
})

test('brews page deep-links a method via the URL', async ({ page }) => {
  await page.goto('/brews?method=aeropress')
  await expect(page.getByLabel('Brewing method')).toContainText('AeroPress')
  await expect(page.getByText('Standard').first()).toBeVisible()
})

test('brews method select filters by typed query', async ({ page }) => {
  await page.goto('/brews')
  await clickUntil(
    page.getByLabel('Brewing method'),
    page.getByPlaceholder('Search methods'),
  )
  await page.getByPlaceholder('Search methods').fill('aero')
  await expect(page.getByRole('option')).toHaveText(['AeroPress'])

  await page.getByPlaceholder('Search methods').fill('chemex')
  await expect(page.getByText('No methods match “chemex”.')).toBeVisible()
})

test('brews method select is keyboard-navigable', async ({ page }) => {
  await page.goto('/brews')
  await clickUntil(
    page.getByLabel('Brewing method'),
    page.getByPlaceholder('Search methods'),
  )
  await page.keyboard.type('cold')
  await page.keyboard.press('Enter')
  const trigger = page.getByRole('button', {
    name: 'Brewing method Cold Brew',
  })
  await expect(trigger).toBeVisible()
  await expect(trigger).toBeFocused()
  await expect(page).toHaveURL(/[?&]method=coldbrew\b/)
})

test('brews method select Escape closes and restores focus', async ({
  page,
}) => {
  await page.goto('/brews')
  const trigger = page.getByRole('button', {
    name: 'Brewing method Espresso',
  })
  await clickUntil(trigger, page.getByPlaceholder('Search methods'))
  await page.keyboard.press('Escape')
  await expect(page.getByPlaceholder('Search methods')).toHaveCount(0)
  await expect(trigger).toBeFocused()
})

test('coffees page lists coffees', async ({ page }) => {
  await page.goto('/coffees')
  await expect(page.getByRole('heading', { name: 'Coffees' })).toBeVisible()
  // .first(): the coffees list renders both a desktop table row and a mobile
  // card, so the name appears twice in the DOM.
  await expect(page.getByText('Ethiopia Guji').first()).toBeVisible()
  // Country is its own cell — exact so "Ethiopia Guji" does not count.
  await expect(
    page.getByRole('cell', { name: 'Ethiopia', exact: true }).first(),
  ).toBeVisible()
  await expect(
    page.getByRole('cell', { name: 'Guji', exact: true }).first(),
  ).toBeVisible()
})

test('equipment page lists grinders and brewing devices', async ({ page }) => {
  await page.goto('/equipment')
  await expect(page.getByRole('heading', { name: 'Equipment' })).toBeVisible()
  // Grinders tab (default) shows the seeded grinder; exact match avoids the
  // mobile card's duplicate "Brand Name" text.
  await expect(page.getByText('Niche Zero', { exact: true })).toBeVisible()
  // The seeded device lives behind the Brewing Devices tab.
  const device = page.getByText('Linea Mini', { exact: true })
  await clickUntil(page.getByRole('tab', { name: 'Brewing Devices' }), device)
  await expect(device).toBeVisible()
})
