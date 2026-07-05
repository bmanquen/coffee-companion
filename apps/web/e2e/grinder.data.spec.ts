import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

// Covers the grinder CRUD forms. Each spec creates the grinder it acts on with a
// unique name so retries and other specs never collide on the per-user unique
// grinder name.

async function createGrinder(page: Page, name: string) {
  await page.goto('/equipment/grinders/new')
  await page.getByPlaceholder('e.g. Niche Zero').fill(name)
  await page.getByPlaceholder('e.g. Niche', { exact: true }).fill('Test Brand')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page).toHaveURL(/\/equipment$/)
  // Grinders is the default tab. Match exactly: the mobile card also renders the
  // name (as "Brand Name"), so a substring match would hit two elements.
  await expect(page.getByText(name, { exact: true })).toBeVisible()
}

test('create a grinder via the new-grinder form', async ({ page }) => {
  await createGrinder(page, `E2E Grinder ${Date.now()}`)
})

test('edit a grinder updates its name in the list', async ({ page }) => {
  const name = `E2E Grinder Edit ${Date.now()}`
  const updated = `${name} Updated`

  await createGrinder(page, name)

  const row = page.getByRole('row', { name: new RegExp(name) })
  await row.getByRole('button', { name: 'Edit grinder' }).click()
  await expect(
    page.getByRole('heading', { name: 'Edit Grinder' }),
  ).toBeVisible()

  await page.getByPlaceholder('e.g. Niche Zero').fill(updated)
  await page.getByRole('button', { name: 'Save' }).click()

  await expect(page).toHaveURL(/\/equipment$/)
  await expect(page.getByText(updated, { exact: true })).toBeVisible()
  // The original name no longer appears on its own.
  await expect(page.getByText(name, { exact: true })).toHaveCount(0)
})

test('delete a grinder removes it from the list', async ({ page }) => {
  const name = `E2E Grinder Delete ${Date.now()}`

  await createGrinder(page, name)

  const row = page.getByRole('row', { name: new RegExp(name) })
  await row.getByRole('button', { name: 'Delete grinder' }).click()

  // Confirm in the dialog (its button is named exactly "Delete", distinct from
  // the row trigger's "Delete grinder").
  await page.getByRole('button', { name: 'Delete', exact: true }).click()

  await expect(page.getByText(name)).toHaveCount(0)
})
