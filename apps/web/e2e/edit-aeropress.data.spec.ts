import { expect, test } from '@playwright/test'
import { pickBrewsMethod } from './helpers'

// Covers the aeropress edit form: open a brew's edit page from the AeroPress
// log, change a field, save, and confirm the update lands back on /brews.
test('edit an aeropress brew updates it in the log', async ({ page }) => {
  await page.goto('/brews')

  // Open the first brew's edit page (the pencil action on its row). The
  // method select is the effect's own gate: the default Espresso log labels
  // its pencil "Edit shot", so an "Edit brew" button appearing is proof the
  // method switched.
  const editBrew = page.getByRole('button', { name: 'Edit brew' }).first()
  await pickBrewsMethod(page, 'AeroPress')
  await expect(editBrew).toBeVisible()
  await editBrew.click()
  await expect(page).toHaveURL(/\/aeropress\/[^/]+\/edit$/)

  // Change the steep time via minutes + seconds (seeded 90s opens as 1 / 30)
  // and save. 2 minutes + 3 seconds is stored as 123 whole seconds.
  await page.getByLabel('Steep Time (minutes)').fill('2')
  await page.getByLabel('Steep Time (seconds)').fill('3')
  await page.getByRole('button', { name: 'Save', exact: true }).click()

  await expect(page).toHaveURL(/\/brews$/)
  await pickBrewsMethod(page, 'AeroPress')
  await expect(page.getByText('2m 3s').first()).toBeVisible()
})
