import { expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

// Helpers shared across the specs.

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

// The server sends every page fully rendered, so a control is present, visible
// and clickable a moment before React attaches its handler to it. A click that
// lands in that window reaches the DOM, does nothing, and is reported as a
// success — the run then fails somewhere else, wherever the click's effect was
// supposed to appear. CI hits the window because two workers share the runner's
// CPU; a developer's machine hydrates too fast to see it.
//
// So drive the first click after a navigation by its effect rather than by the
// control: click, look for what the click causes, and click again if it never
// came. Waiting on the control instead would prove nothing — it is in the
// server's HTML either way, hydrated or not.
export async function clickUntil(control: Locator, effect: Locator) {
  await expect(async () => {
    await control.click({ timeout: 5_000 })
    await expect(effect).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
}
