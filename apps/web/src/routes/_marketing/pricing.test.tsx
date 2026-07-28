import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PricingPage } from './pricing'
import { plans } from '@/lib/plans'

function renderPricing() {
  const onCheckout = vi.fn()
  const onNotify = vi.fn()
  const utils = render(
    <PricingPage onCheckout={onCheckout} onNotify={onNotify} />,
  )
  return { ...utils, onCheckout, onNotify }
}

// The card for a Plan, found by its heading rather than by position, so
// reordering the catalogue doesn't break these.
function planCard(name: string) {
  return within(
    screen.getByRole('heading', { name, level: 2 }).closest('div[data-slot]') ??
      screen.getByRole('heading', { name, level: 2 }).parentElement!
        .parentElement!,
  )
}

describe('PricingPage', () => {
  it('renders every Plan in the catalogue', () => {
    renderPricing()
    for (const plan of plans) {
      expect(
        screen.getByRole('heading', { name: plan.name, level: 2 }),
      ).toBeTruthy()
    }
  })

  it('shows monthly prices by default', () => {
    renderPricing()
    expect(screen.getByText('$4.99')).toBeTruthy()
    expect(screen.getByText('$7.99')).toBeTruthy()
    expect(screen.getAllByText('/month').length).toBeGreaterThan(0)
  })

  it('switches to annual prices when the billing period is toggled', () => {
    renderPricing()

    fireEvent.click(screen.getByRole('button', { name: 'Annual' }))

    expect(screen.getByText('$44.99')).toBeTruthy()
    expect(screen.getByText('$74.99')).toBeTruthy()
    expect(screen.queryByText('$4.99')).toBeNull()
    expect(screen.getAllByText('/year').length).toBeGreaterThan(0)
  })

  it('shows Free as free in both billing periods', () => {
    renderPricing()
    expect(screen.getAllByText('Free').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Annual' }))
    expect(screen.getAllByText('Free').length).toBeGreaterThan(0)
  })

  it('sends Free and Pro to checkout with their own Plan identifiers', () => {
    const { onCheckout, onNotify } = renderPricing()

    fireEvent.click(planCard('Free').getByRole('button', { name: 'Start logging' }))
    expect(onCheckout).toHaveBeenCalledWith('free')

    fireEvent.click(planCard('Pro').getByRole('button', { name: 'Subscribe' }))
    expect(onCheckout).toHaveBeenCalledWith('pro')

    expect(onCheckout).toHaveBeenCalledTimes(2)
    expect(onNotify).not.toHaveBeenCalled()
  })

  it('registers interest for Pro+ and never sends it to checkout', () => {
    const { onCheckout, onNotify } = renderPricing()

    fireEvent.click(planCard('Pro+').getByRole('button', { name: 'Notify me' }))

    expect(onNotify).toHaveBeenCalledWith('pro_plus')
    expect(onCheckout).not.toHaveBeenCalled()
  })

  it('marks the AI row as coming soon while still showing its values', () => {
    renderPricing()

    const aiLabels = screen.getAllByText('AI calls')
    expect(aiLabels.length).toBe(plans.length)
    // The marker sits alongside the label, not instead of the values.
    expect(
      within(aiLabels[0].closest('dt')!).getByText('Coming soon'),
    ).toBeTruthy()
    expect(screen.getByText('5 lifetime')).toBeTruthy()
    expect(screen.getByText('30 / month')).toBeTruthy()
  })

  it('states the Free Plan limits on its own card', () => {
    renderPricing()
    const free = planCard('Free')

    expect(free.getByText('Your 5 most-recently-brewed Coffees')).toBeTruthy()
    expect(free.getByText('Coffee names and roasters')).toBeTruthy()
    // Grinders 1, Brewing Devices 3.
    expect(within(free.getByText('Grinders').closest('div')!).getByText('1'))
      .toBeTruthy()
    expect(
      within(free.getByText('Brewing Devices').closest('div')!).getByText('3'),
    ).toBeTruthy()
  })

  it('says Brewing Devices, not Brewers', () => {
    const { container } = renderPricing()
    expect(screen.getAllByText('Brewing Devices').length).toBe(plans.length)
    expect(container.textContent).not.toMatch(/\bBrewers?\b/)
  })

  // The accordion mounts an answer only once its question is opened, so each of
  // these opens the question it is about.
  function openQuestion(name: RegExp) {
    fireEvent.click(screen.getByRole('button', { name }))
  }

  it('answers what happens to old Brews on Free', () => {
    renderPricing()
    openQuestion(/what happens to my old Brews/i)

    const answer = screen.getByText(/your Shelf/i)
    expect(answer.textContent).toMatch(/Sealed/)
    expect(answer.textContent).toMatch(/nothing is ever deleted/i)
    expect(answer.textContent).toMatch(/upgrading reopens/i)
  })

  it('says a Coffee off the Shelf is still brewable', () => {
    renderPricing()
    openQuestion(/still brew a Coffee that has fallen off the Shelf/i)

    expect(screen.getByText(/stays fully usable/i)).toBeTruthy()
  })

  it('says sealing is permanent on Free until you subscribe', () => {
    renderPricing()
    openQuestion(/does sealing ever undo itself/i)

    expect(screen.getByText(/stay sealed until you subscribe/i)).toBeTruthy()
  })

  it('states that logging is never limited', () => {
    renderPricing()
    expect(screen.getByText(/Unlimited Coffees/)).toBeTruthy()
    expect(screen.getByText(/Unlimited Brews/)).toBeTruthy()
  })
})
