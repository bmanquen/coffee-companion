import { fireEvent, render, screen } from '@testing-library/react-native'
import { E2E_SIGN_IN_TEST_ID, SignInScreen } from './SignInScreen'

describe('e2e sign-in handle', () => {
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

    fireEvent.press(screen.getByTestId(E2E_SIGN_IN_TEST_ID))
    expect(onE2ESignIn).toHaveBeenCalledTimes(1)
  })
})
