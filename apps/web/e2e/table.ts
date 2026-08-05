import type { Page } from '@playwright/test'

// Locators shared by the specs that read a list page's table.

// Rows are matched by accessible name, which is the row's cells joined — a
// Coffee's name survives Sealing, so this addresses a Sealed row too.
export const rowFor = (page: Page, name: string) =>
  page.getByRole('row', { name: new RegExp(name) })

// The desktop table. The mobile card stack renders the same content and is
// hidden at this width, so scoping to it keeps a locator to one match.
export const desktopTable = (page: Page) => page.locator('div.lg\\:block table')

// Opens a row's detail, where the columns demoted off the summary live (ADR-0003)
// — the Coffees list keeps the dial-in there. Clicks the row's own name cell so
// the click never lands on a control.
export async function expandRow(page: Page, name: string) {
  const table = desktopTable(page)
  await table
    .getByRole('row', { name: new RegExp(name) })
    .getByRole('cell', { name })
    .click()
  return table
}
