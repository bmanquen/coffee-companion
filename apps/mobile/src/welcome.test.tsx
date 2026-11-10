import { render, screen } from '@testing-library/react-native'
import { App } from './App'
import { SIGN_OUT } from './auth/copy'
import { writeHostTreeArtifacts } from './test/host-tree'
import {
  SIGN_OUT_TEST_ID,
  WELCOME_A11Y_LABEL,
  WELCOME_HEADING_ROLE,
  WELCOME_HEADING_TEST_ID,
  WELCOME_SCREEN_TEST_ID,
  welcomeMessage,
} from './welcome'
import type { Auth } from './auth/use-auth'

const signedIn: Auth = {
  session: {
    user: { name: 'Ada Lovelace', email: 'ada@example.com' },
  },
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
}

describe('App welcome screen', () => {
  it('shows the app name as a heading when signed in', async () => {
    const view = await render(<App auth={signedIn} />)

    const welcomeHost = screen.getByTestId(WELCOME_SCREEN_TEST_ID)
    expect(welcomeHost.props.collapsable).toBe(false)
    expect(welcomeHost.props.testID).toBe(WELCOME_SCREEN_TEST_ID)
    expect(screen.getByLabelText(WELCOME_A11Y_LABEL)).toBeTruthy()
    expect(
      screen.getByRole(WELCOME_HEADING_ROLE, { name: welcomeMessage() }),
    ).toBeTruthy()
    expect(screen.getByTestId(WELCOME_HEADING_TEST_ID)).toBeTruthy()
    expect(screen.getByText('Ada Lovelace')).toBeTruthy()
    expect(screen.getByRole('button', { name: SIGN_OUT })).toBeTruthy()
    expect(screen.getByTestId(SIGN_OUT_TEST_ID)).toHaveTextContent(SIGN_OUT)

    writeHostTreeArtifacts(view.toJSON())
  })
})
