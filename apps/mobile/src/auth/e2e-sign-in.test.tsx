import { fireEvent, render, screen } from '@testing-library/react-native'
import { E2E_SIGN_IN, E2E_USER_ENV } from './e2e'
import { E2E_SIGN_IN_TEST_ID, SignInScreen } from './SignInScreen'

describe('e2e sign-in handle', () => {
  const original = process.env[E2E_USER_ENV]

  beforeEach(() => {
    delete process.env[E2E_USER_ENV]
  })

  afterEach(() => {
    if (original === undefined) delete process.env[E2E_USER_ENV]
    else process.env[E2E_USER_ENV] = original
  })

  it('is not rendered when the persona env is unset', async () => {
    await render(
      <SignInScreen
        mode="sign-in"
        error={null}
        busy={false}
        showApple
        onGoogle={() => {}}
        onApple={() => {}}
        onToggleMode={() => {}}
      />,
    )

    expect(screen.queryByTestId(E2E_SIGN_IN_TEST_ID)).toBeNull()
  })

  it('is not rendered when no handler is supplied', async () => {
    await render(
      <SignInScreen
        mode="sign-in"
        error={null}
        busy={false}
        showApple
        onGoogle={() => {}}
        onApple={() => {}}
        onToggleMode={() => {}}
        showE2ESignIn
      />,
    )

    expect(screen.queryByTestId(E2E_SIGN_IN_TEST_ID)).toBeNull()
  })

  it('presses through to the auth action when shown', async () => {
    const onE2ESignIn = jest.fn()
    await render(
      <SignInScreen
        mode="sign-in"
        error={null}
        busy={false}
        showApple
        onGoogle={() => {}}
        onApple={() => {}}
        onToggleMode={() => {}}
        onE2ESignIn={onE2ESignIn}
        showE2ESignIn
      />,
    )

    expect(screen.getByRole('button', { name: E2E_SIGN_IN })).toBeTruthy()
    fireEvent.press(screen.getByTestId(E2E_SIGN_IN_TEST_ID))
    expect(onE2ESignIn).toHaveBeenCalledTimes(1)
  })
})
