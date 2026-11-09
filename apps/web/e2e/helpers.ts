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

// Opens a row's detail, where the columns demoted off the summary live (ADR-0003)
// — the Coffees list keeps the dial-in there. Clicks the row's own name cell so
// the click never lands on a control. Driven by the expanded detail so a first
// click after navigation isn't lost in the hydration gap.
export async function expandRow(page: Page, name: string) {
  const table = desktopTable(page)
  const nameCell = table
    .getByRole('row', { name: new RegExp(name) })
    .getByRole('cell', { name })
  await clickUntil(nameCell, table.locator('.opacity-100'))
  return table
}

// Opening a picker and choosing a row, driven by the option so the open
// survives the gap above. The only way any spec should open one.
export async function pickOption(trigger: Locator, option: Locator) {
  await clickUntil(trigger, option)
  await option.click()
}

// The /brews method switcher: labelled "Brewing method", options are the
// method names the page used to show as tabs.
export const brewsMethodSelect = (page: Page) =>
  page.getByLabel('Brewing method')

export async function pickBrewsMethod(page: Page, method: string) {
  await pickOption(
    brewsMethodSelect(page),
    page.getByRole('option', { name: method, exact: true }),
  )
}

// The counterpart for an interaction with no effect to drive it. An unhydrated
// fill sets the DOM value and React never hears it, so the form state stays
// empty and the submit that follows fails validation instead of navigating; an
// unhydrated tap on a card does nothing at all. Nothing on the page tells
// either apart from the hydrated case, so wait on React itself: it tags a host
// node with the props its delegated listener dispatches through as it hydrates
// that node.
//
// Per node rather than per document, because the feeds render through
// useSuspenseQuery: the document hydrates around a boundary that is still
// streaming, so a flag the app raised once would go up while the node under
// test was still inert. Pass one node (`.first()` when the locator may match
// more than one) so a uniqueness check after this wait is the thing that
// fails, not Playwright strict mode inside evaluate().
function isReactHostTagged(el: Element) {
  return Object.keys(el).some((key) => key.startsWith('__reactProps$'))
}

type ReactFiber = {
  return: ReactFiber | null
  tag: number
  stateNode: { current: unknown; pendingLanes: number } | null
}

// __reactProps$ is written in hydrateInstance, still in the render phase.
// HostRoot.tag is 3; FiberRoot.current swaps to that fiber only in commit,
// and pendingLanes is 0 once that commit (and any follow-up) has drained.
function isReactCommitIdle(el: Element) {
  const fiberKey = Object.keys(el).find((key) => key.startsWith('__reactFiber$'))
  if (!fiberKey) return false
  let fiber = (el as unknown as Record<string, ReactFiber | undefined>)[fiberKey]
  if (!fiber) return false
  while (fiber.return) fiber = fiber.return
  if (fiber.tag !== 3) return false
  const root = fiber.stateNode
  return Boolean(root && root.current === fiber && root.pendingLanes === 0)
}

async function waitUntilReactTagged(node: Locator, message: string) {
  await expect(async () => {
    expect(await node.evaluate(isReactHostTagged), message).toBe(true)
  }).toPass({ timeout: 30_000 })
}

async function waitUntilReactIdle(node: Locator, message: string) {
  await expect(async () => {
    expect(await node.evaluate(isReactCommitIdle), message).toBe(true)
  }).toPass({ timeout: 30_000 })
}

export async function waitForHydration(node: Locator) {
  await waitUntilReactTagged(
    node,
    'React never tagged this node. If the page is interactive in a browser, the tag has been renamed.',
  )
  // The tagged node can land during hydrateInstance while a sibling outlet is
  // still uncommitted. Both layouts wrap <Outlet /> in <main>, so that host is
  // where we wait for commit before counts that must not see SSR leftovers.
  const outlet = node.page().locator('main').first()
  await waitUntilReactTagged(
    outlet,
    'React never tagged the page outlet. If the page is interactive in a browser, the tag has been renamed.',
  )
  await waitUntilReactIdle(
    outlet,
    'React never committed the page outlet. If the page is interactive in a browser, the commit signal has changed.',
  )
}
