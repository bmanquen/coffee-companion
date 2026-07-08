import { expect, test } from '@playwright/test'

// Covers the aeropress edit form: open a brew's edit page from the AeroPress
// tab, change a field, save, and confirm the update lands back on /brews.
test('edit an aeropress brew updates it in the log', async ({ page }) => {
  await page.goto('/brews')
  await page.getByRole('tab', { name: 'AeroPress' }).click()

  // Open the first brew's edit page (the pencil action on its row).
  await page.getByRole('button', { name: 'Edit brew' }).first().click()
  await expect(page).toHaveURL(/\/aeropress\/[^/]+\/edit$/)

  // Change the steep time to a distinctive value and save.
  await page.getByPlaceholder('90').fill('123')
  await page.getByRole('button', { name: 'Save', exact: true }).click()

  await expect(page).toHaveURL(/\/brews$/)
  await page.getByRole('tab', { name: 'AeroPress' }).click()
  await expect(page.getByText('123s').first()).toBeVisible()
})
