import { expect, test } from '@playwright/test'

// The bottom tab bar and mobile header are shown/hidden purely via Tailwind
// media-query classes (`md:hidden` / `hidden md:inline-flex`). jsdom doesn't
// evaluate media queries, so the responsive behaviour is verified here in a
// real browser by toggling the viewport. Runs as the authenticated user.
const MOBILE = { width: 390, height: 844 }
// Portrait tablet, in the 768–1024 band. The nav chrome switches at lg (1024),
// so tablets get the mobile bottom bar — matching the card layout decision.
const TABLET = { width: 834, height: 1112 }
const DESKTOP = { width: 1280, height: 800 }

test('small screens show the bottom tab bar and header, not the drawer trigger', async ({
  page,
}) => {
  await page.setViewportSize(MOBILE)
  await page.goto('/')

  const bottomNav = page.getByRole('navigation', { name: 'Primary' })
  await expect(bottomNav).toBeVisible()
  await expect(bottomNav.getByRole('link', { name: 'Brews' })).toBeVisible()
  await expect(page.getByRole('banner')).toBeVisible()

  await expect(page.getByRole('button', { name: 'Open menu' })).toBeHidden()
})

test('tablet-width screens still use the mobile bottom tab bar (< lg)', async ({
  page,
}) => {
  await page.setViewportSize(TABLET)
  await page.goto('/')

  const bottomNav = page.getByRole('navigation', { name: 'Primary' })
  await expect(bottomNav).toBeVisible()
  await expect(bottomNav.getByRole('link', { name: 'Brews' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open menu' })).toBeHidden()
})

test('large screens show the drawer trigger, not the mobile chrome', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP)
  await page.goto('/')

  await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeHidden()
  await expect(page.getByRole('banner')).toBeHidden()
})
