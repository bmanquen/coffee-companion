import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react-native'
import { App } from './App'
import {
  WELCOME_A11Y_LABEL,
  WELCOME_HEADING_ROLE,
  WELCOME_HEADING_TEST_ID,
  WELCOME_SCREEN_TEST_ID,
  welcomeMessage,
} from './welcome'

describe('App welcome screen', () => {
  it('shows the app name as a heading', async () => {
    const view = await render(<App />)

    expect(screen.getByTestId(WELCOME_SCREEN_TEST_ID)).toBeTruthy()
    expect(screen.getByLabelText(WELCOME_A11Y_LABEL)).toBeTruthy()
    expect(
      screen.getByRole(WELCOME_HEADING_ROLE, { name: welcomeMessage() }),
    ).toBeTruthy()
    expect(screen.getByTestId(WELCOME_HEADING_TEST_ID)).toBeTruthy()

    writeWelcomeArtifacts(view.toJSON())
  })
})

function writeWelcomeArtifacts(tree: unknown) {
  const dest = process.env.VERIFY_MOBILE_ARTIFACTS
  if (!dest) return
  mkdirSync(dest, { recursive: true })
  writeFileSync(join(dest, 'tree.json'), `${JSON.stringify(tree, null, 2)}\n`)
  writeFileSync(join(dest, 'tree.txt'), formatHostTree(tree))
}

function formatHostTree(node: unknown, indent = 0): string {
  if (node == null) return ''
  if (typeof node === 'string' || typeof node === 'number') {
    return `${' '.repeat(indent)}${node}\n`
  }
  if (Array.isArray(node)) {
    return node.map((child) => formatHostTree(child, indent)).join('')
  }
  if (typeof node !== 'object') return ''

  const element = node as {
    type?: unknown
    props?: Record<string, unknown>
    children?: unknown
  }
  const role =
    typeof element.props?.accessibilityRole === 'string'
      ? element.props.accessibilityRole
      : String(element.type ?? 'node')
  const name =
    typeof element.props?.accessibilityLabel === 'string'
      ? element.props.accessibilityLabel
      : ''
  const testId =
    typeof element.props?.testID === 'string' ? element.props.testID : ''
  const extras = [
    name ? `"${name}"` : '',
    testId ? `testID=${testId}` : '',
  ]
    .filter(Boolean)
    .join(' ')
  const line = `${' '.repeat(indent)}${role}${extras ? ` ${extras}` : ''}\n`
  return line + formatHostTree(element.children, indent + 2)
}
