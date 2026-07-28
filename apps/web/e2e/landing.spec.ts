import { expect, test } from '@playwright/test'

// The public marketing site, unauthenticated (the `public` project carries no
// bypass cookie). Content assertions stay loose — they check the page says the
// right kind of thing, not its exact wording, so copy can be tuned freely.

test('the home page pitches the product and offers a way in', async ({
  page,
}) => {
  await page.goto('/')

  await expect(
    page.getByRole('heading', { level: 1, name: /dialed it in/i }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: /start logging/i }).first(),
  ).toBeVisible()
})

test('the home page shows the product itself, with a Dialed-in Brew marked', async ({
  page,
}) => {
  await page.goto('/')

  // The hero renders the app's real table with sample Shots — verified here in
  // a browser because the card/table split is a CSS breakpoint decision jsdom
  // can't evaluate. DataTable renders both layouts and hides one with CSS, so
  // scope to the desktop table rather than matching across both.
  const table = page.getByRole('table')
  await expect(table).toBeVisible()
  await expect(table.getByLabel('Dialed in')).toBeVisible()
  await expect(table.getByText('Ethiopia Guji').first()).toBeVisible()
})

test('the marketing header reaches pricing', async ({ page }) => {
  await page.goto('/')

  // Pricing appears in both the header and the footer; this is the header's.
  await page
    .getByRole('navigation', { name: 'Marketing' })
    .getByRole('link', { name: 'Pricing' })
    .click()
  await expect(page).toHaveURL(/\/pricing$/)
  await expect(page.getByRole('heading', { name: 'Pricing' })).toBeVisible()
})

test('marketing pages render none of the authenticated app chrome', async ({
  page,
}) => {
  for (const path of ['/', '/pricing']) {
    await page.goto(path)

    // The two pieces that would otherwise leak: the mobile header (a banner)
    // and the desktop drawer trigger. The signed-in bottom tab bar hides itself
    // without a session anyway, but assert it too so a future change that drops
    // that guard is caught here.
    await expect(page.getByRole('button', { name: 'Open menu' })).toHaveCount(0)
    await expect(
      page.getByRole('navigation', { name: 'Primary' }),
    ).toHaveCount(0)
    await expect(page.getByText('Sign Out')).toHaveCount(0)
  }
})

test('the home page carries its canonical URL and social card tags', async ({
  page,
}) => {
  await page.goto('/')

  // Presence and shape only — the copy itself is free to change.
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    /^https?:\/\/.+\/$/,
  )
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    /.+/,
  )
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    'content',
    /.+/,
  )
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    /^https?:\/\/.+/,
  )
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    'content',
    'summary_large_image',
  )
})
