import { fireEvent, render, screen } from '@testing-library/react-native'
import { App } from '../App'
import { writeHostTreeArtifacts } from '../test/host-tree'
import {
  APP_NAME,
  ERROR_PLAY_SERVICES,
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
import {
  SIGN_IN_A11Y_LABEL,
  SIGN_IN_ERROR_TEST_ID,
  SIGN_IN_HEADING_TEST_ID,
  SIGN_IN_NO_ACCOUNT_TEST_ID,
  SIGN_IN_SCREEN_TEST_ID,
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
    signOut: async () => {},
    ...overrides,
  }
}

describe('sign-in screen', () => {
  it('shows the heading, both provider buttons, and the no-account line', async () => {
    const view = await render(<App auth={signedOut()} />)

    expect(screen.getByTestId(SIGN_IN_SCREEN_TEST_ID)).toBeTruthy()
    expect(screen.getByLabelText(SIGN_IN_A11Y_LABEL)).toBeTruthy()
    expect(screen.getByRole('header', { name: APP_NAME })).toBeTruthy()
    expect(screen.getByRole('header', { name: SIGN_IN_HEADING })).toBeTruthy()
    expect(screen.getByTestId(SIGN_IN_HEADING_TEST_ID)).toBeTruthy()
    expect(
      screen.getByRole('button', { name: SIGN_IN_WITH_GOOGLE }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: SIGN_IN_WITH_APPLE }),
    ).toBeTruthy()
    expect(screen.getByTestId(SIGN_IN_NO_ACCOUNT_TEST_ID)).toBeTruthy()
    expect(screen.getByText(NO_ACCOUNT_PROMPT)).toBeTruthy()
    expect(screen.getByRole('button', { name: NO_ACCOUNT_ACTION })).toBeTruthy()
    expect(screen.queryByRole('button', { name: SIGN_OUT })).toBeNull()

    writeHostTreeArtifacts(view.toJSON())
  })

  it('hides Sign in with Apple on Android', async () => {
    await render(<App auth={signedOut({ showApple: false })} />)

    expect(
      screen.getByRole('button', { name: SIGN_IN_WITH_GOOGLE }),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: SIGN_IN_WITH_APPLE })).toBeNull()
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

    fireEvent.press(screen.getByRole('button', { name: NO_ACCOUNT_ACTION }))
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
    expect(
      screen.getByRole('button', { name: SIGN_UP_WITH_GOOGLE }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: SIGN_UP_WITH_APPLE }),
    ).toBeTruthy()
    expect(screen.getByText(HAS_ACCOUNT_PROMPT)).toBeTruthy()
    expect(
      screen.getByRole('button', { name: HAS_ACCOUNT_ACTION }),
    ).toBeTruthy()
  })

  it('renders each sign-in error the user can hit', async () => {
    const view = await render(
      <SignInScreen
        mode="sign-in"
        error={ERROR_SIGN_IN_FAILED}
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
        error={ERROR_SIGN_IN_UNAVAILABLE}
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
        error={ERROR_PLAY_SERVICES}
        busy={false}
        showApple={false}
        onGoogle={() => {}}
        onApple={() => {}}
        onToggleMode={() => {}}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(ERROR_PLAY_SERVICES)
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

    fireEvent.press(screen.getByRole('button', { name: SIGN_IN_WITH_GOOGLE }))
    fireEvent.press(screen.getByRole('button', { name: SIGN_IN_WITH_APPLE }))
    expect(onGoogle).toHaveBeenCalledTimes(1)
    expect(onApple).toHaveBeenCalledTimes(1)
  })
})
