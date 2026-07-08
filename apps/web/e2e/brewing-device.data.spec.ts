import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

// Covers the brewing device CRUD forms. Each spec creates the device it acts on
// with a unique name so retries and other specs never collide on the per-user
// unique device name.

async function createDevice(page: Page, name: string) {
  await page.goto('/equipment/brewing-devices/new')
  await page.getByPlaceholder('e.g. Linea Mini').fill(name)
  await page.getByPlaceholder('e.g. La Marzocco').fill('Test Brand')

  // Type SearchSelect — pick the seeded Espresso type. Scope to the dropdown
  // option so we match the type, not any other "Espresso" text on the page.
  await page.getByText('Select Type').click()
  await page.getByRole('option', { name: 'Espresso', exact: true }).click()

  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page).toHaveURL(/\/equipment$/)
  // /equipment defaults to the Grinders tab; devices live behind their own tab.
  // Match exactly: the mobile card also renders the name (as "Brand Name").
  await page.getByRole('tab', { name: 'Brewing Devices' }).click()
  await expect(page.getByText(name, { exact: true })).toBeVisible()
}

test('create a brewing device via the new-device form', async ({ page }) => {
  await createDevice(page, `E2E Device ${Date.now()}`)
})

test('edit a brewing device updates its name in the list', async ({ page }) => {
  const name = `E2E Device Edit ${Date.now()}`
  const updated = `${name} Updated`

  await createDevice(page, name)

  const row = page.getByRole('row', { name: new RegExp(name) })
  await row.getByRole('button', { name: 'Edit brewing device' }).click()
  await expect(
    page.getByRole('heading', { name: 'Edit Brewing Device' }),
  ).toBeVisible()

  await page.getByPlaceholder('e.g. Linea Mini').fill(updated)
  await page.getByRole('button', { name: 'Save' }).click()

  await expect(page).toHaveURL(/\/equipment$/)
  await page.getByRole('tab', { name: 'Brewing Devices' }).click()
  await expect(page.getByText(updated, { exact: true })).toBeVisible()
  // The original name no longer appears on its own.
  await expect(page.getByText(name, { exact: true })).toHaveCount(0)
})

test('delete a brewing device removes it from the list', async ({ page }) => {
  const name = `E2E Device Delete ${Date.now()}`

  await createDevice(page, name)

  const row = page.getByRole('row', { name: new RegExp(name) })
  await row.getByRole('button', { name: 'Delete brewing device' }).click()

  // Confirm in the dialog (its button is named exactly "Delete", distinct from
  // the row trigger's "Delete brewing device").
  await page.getByRole('button', { name: 'Delete', exact: true }).click()

  await expect(page.getByText(name)).toHaveCount(0)
})
