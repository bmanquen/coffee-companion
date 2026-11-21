import { fireEvent, render, screen } from '@testing-library/react-native'
import { App } from '../App'
import { writeHostTreeArtifacts } from '../test/host-tree'
import {
  APP_NAME,
  ERROR_PLAY_SERVICES,
  ERROR_SIGN_IN_CONFLICT_BODY,
  ERROR_SIGN_IN_CONFLICT_TITLE,
  ERROR_SIGN_IN_FAILED,
  ERROR_SIGN_IN_UNAVAILABLE,
  HAS_ACCOUNT_ACTION,
  HAS_ACCOUNT_PROMPT,
  NO_ACCOUNT_ACTION,
  NO_ACCOUNT_PROMPT,
  SIGN_IN_HEADING,
  SIGN_IN_WITH_APPLE,
  SIGN_IN_WITH_GOOGLE,
  SIGN_OUT,
  SIGN_UP_HEADING,
  SIGN_UP_WITH_APPLE,
  SIGN_UP_WITH_GOOGLE,
} from './copy'
import { E2E_USER_ENV } from './e2e'
import {
  E2E_SIGN_IN_TEST_ID,
  SIGN_IN_A11Y_LABEL,
  SIGN_IN_APPLE_TEST_ID,
  SIGN_IN_ERROR_TEST_ID,
  SIGN_IN_GOOGLE_TEST_ID,
  SIGN_IN_HEADING_TEST_ID,
  SIGN_IN_NO_ACCOUNT_TEST_ID,
  SIGN_IN_SCREEN_TEST_ID,
  SIGN_IN_TOGGLE_TEST_ID,
  SignInScreen,
} from './SignInScreen'
import type { Auth } from './use-auth'

function signedOut(overrides: Partial<Auth> = {}): Auth {
  return {
    session: null,
    loading: false,
    busy: false,
    error: null,
    mode: 'sign-in',
    showApple: true,
    setMode: () => {},
    signInGoogle: async () => {},
    signInApple: async () => {},
    signInE2E: async () => {},
    signOut: async () => {},
    ...overrides,
  }
}

describe('sign-in screen', () => {
  const originalE2EUser = process.env[E2E_USER_ENV]

  beforeEach(() => {
    delete process.env[E2E_USER_ENV]
  })

  afterEach(() => {
    if (originalE2EUser === undefined) delete process.env[E2E_USER_ENV]
    else process.env[E2E_USER_ENV] = originalE2EUser
  })

  it('shows the heading, both provider buttons, and the no-account line', async () => {
    const view = await render(<App auth={signedOut()} />)

    const signInHost = screen.getByTestId(SIGN_IN_SCREEN_TEST_ID)
    expect(signInHost.props.collapsable).toBe(false)
    expect(signInHost.props.testID).toBe(SIGN_IN_SCREEN_TEST_ID)
    expect(screen.getByLabelText(SIGN_IN_A11Y_LABEL)).toBeTruthy()
    expect(screen.getByRole('header', { name: APP_NAME })).toBeTruthy()
    expect(screen.getByRole('header', { name: SIGN_IN_HEADING })).toBeTruthy()
    expect(screen.getByTestId(SIGN_IN_HEADING_TEST_ID)).toBeTruthy()
    expect(screen.getByRole('button', { name: SIGN_IN_WITH_GOOGLE })).toBeTruthy()
    expect(screen.getByTestId(SIGN_IN_GOOGLE_TEST_ID)).toBeTruthy()
    expect(screen.getByRole('button', { name: SIGN_IN_WITH_APPLE })).toBeTruthy()
    expect(screen.getByTestId(SIGN_IN_APPLE_TEST_ID)).toBeTruthy()
    expect(screen.getByTestId(SIGN_IN_NO_ACCOUNT_TEST_ID)).toBeTruthy()
    expect(screen.getByText(NO_ACCOUNT_PROMPT)).toBeTruthy()
    expect(screen.getByRole('button', { name: NO_ACCOUNT_ACTION })).toBeTruthy()
    expect(screen.getByTestId(SIGN_IN_TOGGLE_TEST_ID)).toBeTruthy()
    expect(screen.queryByRole('button', { name: SIGN_OUT })).toBeNull()
    expect(screen.queryByTestId(E2E_SIGN_IN_TEST_ID)).toBeNull()

    writeHostTreeArtifacts(view)
  })

  it('hides Sign in with Apple on Android', async () => {
    await render(<App auth={signedOut({ showApple: false })} />)

    expect(screen.getByRole('button', { name: SIGN_IN_WITH_GOOGLE })).toBeTruthy()
    expect(screen.getByTestId(SIGN_IN_GOOGLE_TEST_ID)).toBeTruthy()
    expect(screen.queryByRole('button', { name: SIGN_IN_WITH_APPLE })).toBeNull()
    expect(screen.queryByTestId(SIGN_IN_APPLE_TEST_ID)).toBeNull()
  })

  it('switches to sign-up copy from the no-account line', async () => {
    const setMode = jest.fn()
    await render(
      <SignInScreen
        mode="sign-in"
        error={null}
        busy={false}
        showApple
        onGoogle={() => {}}
        onApple={() => {}}
        onToggleMode={() => setMode('sign-up')}
      />,
    )

    await fireEvent.press(screen.getByRole('button', { name: NO_ACCOUNT_ACTION }))
    expect(setMode).toHaveBeenCalledWith('sign-up')
  })

  it('shows sign-up labels and the already-have-account line', async () => {
    await render(
      <SignInScreen
        mode="sign-up"
        error={null}
        busy={false}
        showApple
        onGoogle={() => {}}
        onApple={() => {}}
        onToggleMode={() => {}}
      />,
    )

    expect(screen.getByRole('header', { name: SIGN_UP_HEADING })).toBeTruthy()
    expect(screen.getByRole('button', { name: SIGN_UP_WITH_GOOGLE })).toBeTruthy()
    expect(screen.getByTestId(SIGN_IN_GOOGLE_TEST_ID)).toHaveTextContent(
      SIGN_UP_WITH_GOOGLE,
    )
    expect(screen.getByRole('button', { name: SIGN_UP_WITH_APPLE })).toBeTruthy()
    expect(screen.getByTestId(SIGN_IN_APPLE_TEST_ID)).toHaveTextContent(
      SIGN_UP_WITH_APPLE,
    )
    expect(screen.getByText(HAS_ACCOUNT_PROMPT)).toBeTruthy()
    expect(screen.getByRole('button', { name: HAS_ACCOUNT_ACTION })).toBeTruthy()
    expect(screen.getByTestId(SIGN_IN_TOGGLE_TEST_ID)).toHaveTextContent(
      HAS_ACCOUNT_ACTION,
    )
  })

  it('renders each sign-in error the user can hit', async () => {
    const view = await render(
      <SignInScreen
        mode="sign-in"
        error={{ title: ERROR_SIGN_IN_FAILED }}
        busy={false}
        showApple
        onGoogle={() => {}}
        onApple={() => {}}
        onToggleMode={() => {}}
      />,
    )
    expect(screen.getByTestId(SIGN_IN_ERROR_TEST_ID)).toHaveTextContent(
      ERROR_SIGN_IN_FAILED,
    )

    await view.rerender(
      <SignInScreen
        mode="sign-in"
        error={{ title: ERROR_SIGN_IN_UNAVAILABLE }}
        busy={false}
        showApple
        onGoogle={() => {}}
        onApple={() => {}}
        onToggleMode={() => {}}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      ERROR_SIGN_IN_UNAVAILABLE,
    )

    await view.rerender(
      <SignInScreen
        mode="sign-in"
        error={{ title: ERROR_PLAY_SERVICES }}
        busy={false}
        showApple={false}
        onGoogle={() => {}}
        onApple={() => {}}
        onToggleMode={() => {}}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(ERROR_PLAY_SERVICES)
  })

  it('shows the same title and body for a sign-in conflict', async () => {
    await render(
      <SignInScreen
        mode="sign-in"
        error={{
          title: ERROR_SIGN_IN_CONFLICT_TITLE,
          body: ERROR_SIGN_IN_CONFLICT_BODY,
        }}
        busy={false}
        showApple
        onGoogle={() => {}}
        onApple={() => {}}
        onToggleMode={() => {}}
      />,
    )

    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText(ERROR_SIGN_IN_CONFLICT_TITLE)).toBeTruthy()
    expect(screen.getByText(ERROR_SIGN_IN_CONFLICT_BODY)).toBeTruthy()
  })

  it('presses Google and Apple through to the auth actions', async () => {
    const onGoogle = jest.fn()
    const onApple = jest.fn()
    await render(
      <SignInScreen
        mode="sign-in"
        error={null}
        busy={false}
        showApple
        onGoogle={onGoogle}
        onApple={onApple}
        onToggleMode={() => {}}
      />,
    )

    await fireEvent.press(screen.getByRole('button', { name: SIGN_IN_WITH_GOOGLE }))
    await fireEvent.press(screen.getByRole('button', { name: SIGN_IN_WITH_APPLE }))
    expect(onGoogle).toHaveBeenCalledTimes(1)
    expect(onApple).toHaveBeenCalledTimes(1)
  })
})
