import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PricingPage, PricingScreen } from './pricing'
import type { PlanId } from '@/lib/plans'
import { createTestProviders } from '@/test/providers'

const authState = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
}))
const mocks = vi.hoisted(() => ({
  signInSocial: vi.fn(),
  upgrade: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: () => ({ data: authState.session }),
    signIn: { social: mocks.signInSocial },
    subscription: { upgrade: mocks.upgrade },
  },
}))

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}))

beforeEach(() => {
  mocks.toastSuccess.mockClear()
  mocks.toastError.mockClear()
})

function renderPricing(
  notify?: (planId: PlanId) => Promise<'recorded' | 'signing-in'>,
  props: { pendingInterest?: PlanId; registeredPlans?: Array<PlanId> } = {},
) {
  const onCheckout = vi.fn()
  const onNotify = vi.fn(notify)
  const utils = render(
    <PricingPage onCheckout={onCheckout} onNotify={onNotify} {...props} />,
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
    expect(onCheckout).toHaveBeenCalledWith('free', 'monthly')

    fireEvent.click(planCard('Pro').getByRole('button', { name: 'Subscribe' }))
    expect(onCheckout).toHaveBeenCalledWith('pro', 'monthly')

    expect(onCheckout).toHaveBeenCalledTimes(2)
    expect(onNotify).not.toHaveBeenCalled()
  })

  // The toggle is not decoration: it decides which price is charged, so the
  // period on screen has to be the period that reaches checkout.
  it('checks out the period the visitor is looking at, not the default', () => {
    const { onCheckout } = renderPricing()

    fireEvent.click(screen.getByRole('button', { name: 'Annual' }))
    fireEvent.click(planCard('Pro').getByRole('button', { name: 'Subscribe' }))

    expect(onCheckout).toHaveBeenCalledWith('pro', 'annual')
  })

  it('registers interest for Pro+ and never sends it to checkout', () => {
    const { onCheckout, onNotify } = renderPricing()

    fireEvent.click(
      planCard('Pro+').getByRole('button', { name: 'Join Waitlist' }),
    )

    expect(onNotify).toHaveBeenCalledWith('proPlus')
    expect(onCheckout).not.toHaveBeenCalled()
  })

  it('says nothing was charged once interest is recorded', async () => {
    renderPricing(async () => 'recorded')

    fireEvent.click(
      planCard('Pro+').getByRole('button', { name: 'Join Waitlist' }),
    )

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled())
    const [message, options] = mocks.toastSuccess.mock.calls[0]
    expect(String(message)).toMatch(/Pro\+/)
    expect(String(options?.description ?? '')).toMatch(/not been charged/i)
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  // The confirmation email is sent by the server on the recording press only,
  // and not at all when mail is unconfigured or failing. The toast cannot see
  // any of that, so it must not claim it.
  it('claims no email it cannot know was sent', async () => {
    renderPricing(async () => 'recorded')

    fireEvent.click(
      planCard('Pro+').getByRole('button', { name: 'Join Waitlist' }),
    )

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled())
    const [message, options] = mocks.toastSuccess.mock.calls[0]
    expect(
      `${String(message)} ${String(options?.description ?? '')}`,
    ).not.toMatch(/email|inbox|sent you/i)
  })

  it('confirms nothing to a visitor sent away to sign in', async () => {
    const { onNotify } = renderPricing(async () => 'signing-in')

    fireEvent.click(
      planCard('Pro+').getByRole('button', { name: 'Join Waitlist' }),
    )

    await waitFor(() => expect(onNotify).toHaveBeenCalled())
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
  })

  it('asks the visitor to try again when recording interest fails', async () => {
    renderPricing(() => Promise.reject(new Error('offline')))

    fireEvent.click(
      planCard('Pro+').getByRole('button', { name: 'Join Waitlist' }),
    )

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled())
    const [message, options] = mocks.toastError.mock.calls[0]
    expect(`${String(message)} ${String(options?.description ?? '')}`).toMatch(
      /again/i,
    )
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
  })

  it('registers a Plan carried back from sign-in without a second press', async () => {
    const { onNotify } = renderPricing(async () => 'recorded', {
      pendingInterest: 'proPlus',
    })

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled())
    expect(onNotify).toHaveBeenCalledWith('proPlus')
    expect(onNotify).toHaveBeenCalledTimes(1)
  })

  it('registers nothing on its own when no Plan came back from sign-in', async () => {
    const { onNotify } = renderPricing(async () => 'recorded')

    await waitFor(() => expect(screen.getByText('Pro+')).toBeTruthy())
    expect(onNotify).not.toHaveBeenCalled()
  })

  it('offers no second press once a Plan is registered', () => {
    const { onNotify } = renderPricing(async () => 'recorded', {
      registeredPlans: ['proPlus'],
    })

    const button = planCard('Pro+').getByRole('button', { name: 'Registered' })
    expect(button.hasAttribute('disabled')).toBe(true)
    expect(
      planCard('Pro+').queryByRole('button', { name: 'Join Waitlist' }),
    ).toBeNull()

    fireEvent.click(button)
    expect(onNotify).not.toHaveBeenCalled()
  })

  // Registering interest is only ever the state of a call to action that
  // registers interest. An interest row against a sellable Plan — which the
  // server accepts — must never take away its purchase path.
  it('leaves a sellable Plan buyable however much interest is on record', () => {
    const { onCheckout } = renderPricing(async () => 'recorded', {
      registeredPlans: ['pro', 'proPlus'],
    })

    const subscribe = planCard('Pro').getByRole('button', { name: 'Subscribe' })
    expect(subscribe.hasAttribute('disabled')).toBe(false)

    fireEvent.click(subscribe)
    expect(onCheckout).toHaveBeenCalledWith('pro', 'monthly')
  })

  it('reads as registered straight after the press that recorded it', async () => {
    renderPricing(async () => 'recorded')

    fireEvent.click(
      planCard('Pro+').getByRole('button', { name: 'Join Waitlist' }),
    )

    expect(
      await planCard('Pro+').findByRole('button', { name: 'Registered' }),
    ).toBeTruthy()
  })

  it('leaves the press available when it did not record', async () => {
    const { onNotify } = renderPricing(() => Promise.reject(new Error('nope')))

    fireEvent.click(
      planCard('Pro+').getByRole('button', { name: 'Join Waitlist' }),
    )

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled())
    expect(
      planCard('Pro+').getByRole('button', { name: 'Join Waitlist' }),
    ).toBeTruthy()
    expect(onNotify).toHaveBeenCalledTimes(1)
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

describe('PricingScreen', () => {
  beforeEach(() => {
    authState.session = null
    mocks.signInSocial.mockClear()
    mocks.upgrade.mockReset()
    mocks.upgrade.mockResolvedValue({ data: {}, error: null })
  })

  // Seeds what the visitor has already registered, so the screen never has to
  // fetch it and the register call is the only request a test can see.
  function renderScreen({
    pendingInterest,
    alreadyRegistered = [],
  }: {
    pendingInterest?: PlanId
    alreadyRegistered?: Array<PlanId>
  } = {}) {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(
      trpc.planInterest.list.queryKey(),
      alreadyRegistered.map((planId) => ({
        id: `interest-${planId}`,
        userId: 'visitor',
        planId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    )
    return render(<PricingScreen pendingInterest={pendingInterest} />, {
      wrapper: Wrapper,
    })
  }

  function stubbedFetch() {
    return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('[]', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
  }

  const registerCall = (spy: ReturnType<typeof stubbedFetch>) =>
    spy.mock.calls.find(([url]) =>
      String(url).includes('planInterest.register'),
    )

  it('records interest through the API for a signed-in visitor', async () => {
    authState.session = { user: { id: 'visitor' } }
    const fetchSpy = stubbedFetch()

    try {
      renderScreen()
      fireEvent.click(
        planCard('Pro+').getByRole('button', { name: 'Join Waitlist' }),
      )

      await waitFor(() => expect(registerCall(fetchSpy)).toBeTruthy())
      expect(String(registerCall(fetchSpy)?.[1]?.body ?? '')).toContain(
        'proPlus',
      )
      expect(mocks.signInSocial).not.toHaveBeenCalled()
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('sends a logged-out visitor to sign in, carrying the Plan they pressed', async () => {
    const fetchSpy = stubbedFetch()

    try {
      renderScreen()
      fireEvent.click(
        planCard('Pro+').getByRole('button', { name: 'Join Waitlist' }),
      )

      await waitFor(() =>
        expect(mocks.signInSocial).toHaveBeenCalledWith({
          provider: 'google',
          callbackURL: '/pricing?interest=proPlus',
        }),
      )
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(mocks.toastSuccess).not.toHaveBeenCalled()
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('records the Plan carried back from sign-in without another press', async () => {
    authState.session = { user: { id: 'visitor' } }
    const fetchSpy = stubbedFetch()

    try {
      renderScreen({ pendingInterest: 'proPlus' })

      await waitFor(() => expect(registerCall(fetchSpy)).toBeTruthy())
      expect(String(registerCall(fetchSpy)?.[1]?.body ?? '')).toContain(
        'proPlus',
      )
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('records nothing when the link carries a Plan already on record', async () => {
    authState.session = { user: { id: 'visitor' } }
    const fetchSpy = stubbedFetch()

    try {
      renderScreen({
        pendingInterest: 'proPlus',
        alreadyRegistered: ['proPlus'],
      })

      await waitFor(() =>
        expect(
          planCard('Pro+').getByRole('button', { name: 'Registered' }),
        ).toBeTruthy(),
      )
      expect(registerCall(fetchSpy)).toBeUndefined()
      expect(mocks.toastSuccess).not.toHaveBeenCalled()
    } finally {
      fetchSpy.mockRestore()
    }
  })

  const subscribeToPro = () =>
    fireEvent.click(planCard('Pro').getByRole('button', { name: 'Subscribe' }))

  it('starts checkout for a signed-in visitor at the monthly price', async () => {
    authState.session = { user: { id: 'visitor' } }

    renderScreen()
    subscribeToPro()

    await waitFor(() =>
      expect(mocks.upgrade).toHaveBeenCalledWith(
        expect.objectContaining({ plan: 'pro', annual: false }),
      ),
    )
    expect(mocks.signInSocial).not.toHaveBeenCalled()
  })

  // The price the visitor is charged is chosen server-side from this flag, so
  // it is the whole of what the toggle buys.
  it('starts checkout at the annual price once the visitor toggles', async () => {
    authState.session = { user: { id: 'visitor' } }

    renderScreen()
    fireEvent.click(screen.getByRole('button', { name: 'Annual' }))
    subscribeToPro()

    await waitFor(() =>
      expect(mocks.upgrade).toHaveBeenCalledWith(
        expect.objectContaining({ plan: 'pro', annual: true }),
      ),
    )
  })

  it('sends a logged-out presser to sign in rather than to checkout', async () => {
    renderScreen()
    subscribeToPro()

    await waitFor(() => expect(mocks.signInSocial).toHaveBeenCalled())
    expect(mocks.upgrade).not.toHaveBeenCalled()
  })

  it('says nothing was charged when checkout cannot be reached', async () => {
    authState.session = { user: { id: 'visitor' } }
    mocks.upgrade.mockResolvedValue({
      data: null,
      error: { message: 'no such price' },
    })

    renderScreen()
    subscribeToPro()

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled())
    const [message, options] = mocks.toastError.mock.calls[0]
    expect(`${String(message)} ${String(options?.description ?? '')}`).toMatch(
      /not been charged/i,
    )
  })

  // Free is a call to action, not a purchase. Nothing about it may reach the
  // payment provider.
  it('never sends the Free plan to checkout', async () => {
    renderScreen()
    fireEvent.click(
      planCard('Free').getByRole('button', { name: 'Save your first brew' }),
    )

    await waitFor(() => expect(mocks.signInSocial).toHaveBeenCalled())
    expect(mocks.upgrade).not.toHaveBeenCalled()
  })

  // Sign-in did not complete, so the visitor is back where they started. Doing
  // nothing leaves them the button; bouncing them at Google again would be a
  // loop they could not escape.
  it('does not act on a Plan carried back by someone still logged out', async () => {
    const fetchSpy = stubbedFetch()

    try {
      renderScreen({ pendingInterest: 'proPlus' })

      await waitFor(() =>
        expect(planCard('Pro+').getByRole('button')).toBeTruthy(),
      )
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(mocks.signInSocial).not.toHaveBeenCalled()
    } finally {
      fetchSpy.mockRestore()
    }
  })
})
