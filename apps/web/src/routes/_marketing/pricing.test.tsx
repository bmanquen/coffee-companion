import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PricingPage } from './pricing'

function renderPricing() {
  const onCheckout = vi.fn()
  const onNotify = vi.fn()
  const utils = render(
    <PricingPage onCheckout={onCheckout} onNotify={onNotify} />,
  )
  return { ...utils, onCheckout, onNotify }
}

function planCard(name: string) {
  const heading = screen.getByRole('heading', { name, level: 2 })
  return within(heading.closest('[data-slot="card"]')!)
}

// The corrected table from spec #45, restated as literals. These deliberately
// do NOT read the Plan catalogue: a test that iterates the module it is testing
// echoes whatever is there and can never catch a wrong price or limit.
const expected = {
  Free: {
    monthly: '$0',
    annual: '$0',
    'Brew history': 'Your 5 most-recently-brewed coffees',
    Search: 'Coffee names and roasters',
    Grinders: '1',
    'Brewing Devices': '3',
    'AI calls': '5 lifetime',
  },
  Pro: {
    monthly: '$4.99',
    annual: '$44.99',
    'Brew history': 'Everything',
    Search: 'Notes, origin, brews, dial-ins',
    Grinders: 'Unlimited',
    'Brewing Devices': 'Unlimited',
    'AI calls': '30 / month',
  },
  'Pro+': {
    monthly: '$7.99',
    annual: '$74.99',
    'Brew history': 'Everything',
    Search: 'Notes, origin, brews, dial-ins',
    Grinders: 'Unlimited',
    'Brewing Devices': 'Unlimited',
    'AI calls': 'Unlimited',
  },
} as const

const planNames = Object.keys(expected) as Array<keyof typeof expected>

describe('PricingPage', () => {
  it('renders exactly the three Plans', () => {
    renderPricing()
    for (const name of planNames) {
      expect(screen.getByRole('heading', { name, level: 2 })).toBeTruthy()
    }
    expect(screen.getAllByRole('heading', { level: 2 }).length).toBe(
      // three Plan cards, plus the "on every plan" and "Questions" headings
      planNames.length + 2,
    )
  })

  it.each(planNames)('shows every advertised value for %s', (name) => {
    renderPricing()
    const card = planCard(name)
    const rows = expected[name]

    expect(card.getByText(rows.monthly)).toBeTruthy()
    for (const label of [
      'Brew history',
      'Search',
      'Grinders',
      'Brewing Devices',
      'AI calls',
    ] as const) {
      const row = card.getByText(label).closest('div')!
      expect(within(row).getByText(rows[label])).toBeTruthy()
    }
  })

  it.each(planNames)('shows the annual price for %s when toggled', (name) => {
    renderPricing()
    fireEvent.click(screen.getByRole('button', { name: 'Annual' }))

    expect(planCard(name).getByText(expected[name].annual)).toBeTruthy()
  })

  it('labels the billing period on the price', () => {
    renderPricing()
    expect(screen.getAllByText('/month').length).toBe(planNames.length)

    fireEvent.click(screen.getByRole('button', { name: 'Annual' }))
    expect(screen.getAllByText('/year').length).toBe(planNames.length)
    expect(screen.queryByText('/month')).toBeNull()
  })

  it('sends Free and Pro to checkout with their own Plan identifiers', () => {
    const { onCheckout, onNotify } = renderPricing()

    fireEvent.click(
      planCard('Free').getByRole('button', { name: 'Save your first brew' }),
    )
    expect(onCheckout).toHaveBeenCalledWith('free')

    fireEvent.click(planCard('Pro').getByRole('button', { name: 'Subscribe' }))
    expect(onCheckout).toHaveBeenCalledWith('pro')

    expect(onCheckout).toHaveBeenCalledTimes(2)
    expect(onNotify).not.toHaveBeenCalled()
  })

  it('registers interest for Pro+ and never sends it to checkout', () => {
    const { onCheckout, onNotify } = renderPricing()

    fireEvent.click(planCard('Pro+').getByRole('button', { name: 'Notify me' }))

    expect(onNotify).toHaveBeenCalledWith('proPlus')
    expect(onCheckout).not.toHaveBeenCalled()
  })

  it('marks the AI row coming soon without hiding its values', () => {
    renderPricing()

    const aiLabel = planCard('Pro').getByText('AI calls')
    expect(within(aiLabel.closest('dt')!).getByText('Coming soon')).toBeTruthy()
    expect(within(aiLabel.closest('div')!).getByText('30 / month')).toBeTruthy()
  })

  it('marks Pro+ itself as not yet buyable', () => {
    renderPricing()
    expect(planCard('Pro+').getAllByText('Coming soon').length).toBeGreaterThan(
      // its own badge, plus the AI row's
      1,
    )
  })

  // The accordion mounts an answer only once its question is opened, and it is
  // single-open — opening one closes the last. So snapshot the page after each
  // question in turn and join, rather than trying to open them all at once.
  function textWithEveryAnswerRead(container: HTMLElement) {
    return screen
      .getAllByRole('button', { name: /\?$/ })
      .map((trigger) => {
        fireEvent.click(trigger)
        return container.textContent
      })
      .join(' ')
  }

  it('answers what happens to old Brews on Free', () => {
    renderPricing()
    fireEvent.click(
      screen.getByRole('button', { name: /what happens to my old Brews/i }),
    )

    const answer = screen.getByText(/your Shelf/i)
    expect(answer.textContent).toMatch(/Sealed/)
    expect(answer.textContent).toMatch(/nothing is ever deleted/i)
    expect(answer.textContent).toMatch(/upgrading reopens/i)
  })

  it('says a Coffee off the Shelf is still brewable', () => {
    renderPricing()
    fireEvent.click(
      screen.getByRole('button', {
        name: /still brew a Coffee that has fallen off the Shelf/i,
      }),
    )

    expect(screen.getByText(/stays fully usable/i)).toBeTruthy()
  })

  it('says sealing is permanent on Free until you subscribe', () => {
    renderPricing()
    fireEvent.click(
      screen.getByRole('button', { name: /does sealing ever undo itself/i }),
    )

    expect(screen.getByText(/stay sealed until you subscribe/i)).toBeTruthy()
  })

  it('never says Brewers, including in the FAQ answers', () => {
    const { container } = renderPricing()
    const text = textWithEveryAnswerRead(container)

    expect(text).toMatch(/Brewing Devices/)
    expect(text).not.toMatch(/\bBrewers?\b/)
  })

  it('never calls a Coffee sealed — sealing stamps Brews', () => {
    const { container } = renderPricing()

    // ADR-0004: sealing is a one-way stamp on individual Brews, never a filter
    // over Coffees. "Sealed Coffee" names a model we explicitly did not build.
    expect(textWithEveryAnswerRead(container)).not.toMatch(/Sealed Coffee/i)
  })

  it('states that logging is never limited', () => {
    renderPricing()
    expect(screen.getByText(/Unlimited coffees/)).toBeTruthy()
    expect(screen.getByText(/Unlimited brews/)).toBeTruthy()
  })
})
