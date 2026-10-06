import { expect, test } from '@playwright/test'
import { waitForHydration } from './helpers'

// Two tabs, one user. Tab B saves a name after tab A loaded the list, so Add
// still appears; the server names the saved casing inside the popover.
test('adding a name another tab already saved shows the saved casing', async ({
  page,
  context,
}) => {
  const saved = `Kaffa Lab ${Date.now()}`

  await page.goto('/coffees/new')
  await waitForHydration(page.getByText('Select Roaster'))
  await page.getByText('Select Roaster').click()
  await expect(page.getByText('Sey', { exact: true })).toBeVisible()

  const tabB = await context.newPage()
  await tabB.goto('/coffees/new')
  await waitForHydration(tabB.getByText('Select Roaster'))
  await tabB.getByText('Select Roaster').click()
  await tabB.getByPlaceholder('Search...').fill(saved)
  await tabB.getByRole('button', { name: /Add/ }).click()
  await expect(tabB.getByText(saved, { exact: true })).toBeVisible()

  await page.getByPlaceholder('Search...').fill(saved.toLowerCase())
  await page.getByRole('button', { name: /Add/ }).click()
  await expect(page.getByRole('alert')).toHaveText(
    `You already have one called ${saved}. Pick it there, or give this one a different name.`,
  )
})
