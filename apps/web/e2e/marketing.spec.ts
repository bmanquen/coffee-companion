import { expect, test } from '@playwright/test'

// The public marketing site, unauthenticated (the `public` project carries no
// bypass cookie). Content assertions stay loose — they check the page says the
// right kind of thing, not its exact wording, so copy can be tuned freely.

test('the home page pitches the product and offers a way in', async ({
  page,
}) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(
    page.getByRole('button', { name: /save your first brew/i }).first(),
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
  await expect(
    page.getByRole('heading', { level: 1, name: /keep your history/i }),
  ).toBeVisible()
})

test('the pricing page renders standalone, with every Plan and a working toggle', async ({
  page,
}) => {
  await page.goto('/pricing')

  for (const plan of ['Free', 'Pro', 'Pro+']) {
    await expect(
      page.getByRole('heading', { level: 2, name: plan, exact: true }),
    ).toBeVisible()
  }

  await expect(page.getByText('$4.99')).toBeVisible()
  await page.getByRole('button', { name: 'Annual' }).click()
  await expect(page.getByText('$44.99')).toBeVisible()
  await expect(page.getByText('$4.99')).toHaveCount(0)
})

test('the pricing FAQ opens the sealing answer', async ({ page }) => {
  await page.goto('/pricing')

  // Radix mounts an answer only once opened — verified in a real browser
  // because the animation and mount behaviour are what a visitor actually hits.
  await page
    .getByRole('button', { name: /what happens to my old Brews/i })
    .click()
  await expect(page.getByText(/your Shelf/i)).toBeVisible()
  await expect(page.getByText(/Nothing is ever deleted/i)).toBeVisible()
})

test('the sitemap lists both marketing routes', async ({ page }) => {
  const response = await page.request.get('/sitemap.xml')

  expect(response.ok()).toBe(true)
  expect(response.headers()['content-type']).toContain('xml')

  const body = await response.text()
  expect(body).toMatch(/<loc>https?:\/\/[^<]+\/<\/loc>/)
  expect(body).toMatch(/<loc>https?:\/\/[^<]+\/pricing<\/loc>/)
})

test('marketing pages render none of the authenticated app chrome', async ({
  page,
}) => {
  for (const path of ['/', '/pricing']) {
    await page.goto(path)

    // Exactly one banner — the marketing header. MobileHeader is also a
    // <header>, so a leak shows up as two rather than as a missing element,
    // which a toHaveCount(0) would never catch.
    await expect(page.getByRole('banner')).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'Open menu' })).toHaveCount(0)
    await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(
      0,
    )
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
  // Raster, not SVG — every major unfurler drops an SVG og:image.
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    /^https?:\/\/.+\.(png|jpg|jpeg)$/,
  )
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    'content',
    'summary_large_image',
  )
})
