import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export function writeHostTreeArtifacts(tree: unknown) {
  const dest = process.env.VERIFY_MOBILE_ARTIFACTS
  if (!dest) return
  mkdirSync(dest, { recursive: true })
  writeFileSync(join(dest, 'tree.json'), `${JSON.stringify(tree, null, 2)}\n`)
  writeFileSync(join(dest, 'tree.txt'), formatHostTree(tree))
}

export function formatHostTree(node: unknown, indent = 0): string {
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
  const extras = [name ? `"${name}"` : '', testId ? `testID=${testId}` : '']
    .filter(Boolean)
    .join(' ')
  const line = `${' '.repeat(indent)}${role}${extras ? ` ${extras}` : ''}\n`
  return line + formatHostTree(element.children, indent + 2)
}
