import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// FlatList's test-renderer tree can cycle through children; skip repeats.
function jsonSafe(value: unknown) {
  const seen = new WeakSet<object>()
  return JSON.stringify(
    value,
    (_key, current) => {
      if (typeof current === 'object' && current !== null) {
        if (seen.has(current)) return undefined
        seen.add(current)
      }
      return current
    },
    2,
  )
}

export function writeHostTreeArtifacts(view: { toJSON: () => unknown }) {
  const dest = process.env.VERIFY_MOBILE_ARTIFACTS
  if (!dest) return
  const tree = view.toJSON()
  mkdirSync(dest, { recursive: true })
  writeFileSync(join(dest, 'tree.json'), `${jsonSafe(tree)}\n`)
  writeFileSync(join(dest, 'tree.txt'), formatHostTree(tree))
}

export function formatHostTree(
  node: unknown,
  indent = 0,
  seen = new WeakSet<object>(),
): string {
  if (node == null) return ''
  if (typeof node === 'string' || typeof node === 'number') {
    return `${' '.repeat(indent)}${node}\n`
  }
  if (Array.isArray(node)) {
    return node.map((child) => formatHostTree(child, indent, seen)).join('')
  }
  if (typeof node !== 'object') return ''
  if (seen.has(node)) return ''
  seen.add(node)

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
  return line + formatHostTree(element.children, indent + 2, seen)
}
