import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

function isGraphNode(value: object) {
  return (
    !Array.isArray(value) &&
    ('_owner' in value || 'return' in value || 'stateNode' in value)
  )
}

export function jsonSafe(value: unknown) {
  const ancestors: Array<object> = []
  const seen = new WeakSet<object>()
  return JSON.stringify(
    value,
    function (this: unknown, _key, current) {
      if (typeof current !== 'object' || current === null) return current
      while (
        ancestors.length > 0 &&
        ancestors[ancestors.length - 1] !== this
      ) {
        ancestors.pop()
      }
      if (ancestors.includes(current)) return undefined
      // Fiber owner/return graphs are DAGs; walking them again explodes the dump.
      if (seen.has(current) && isGraphNode(current)) return undefined
      seen.add(current)
      ancestors.push(current)
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
  ancestors: Array<object> = [],
): string {
  if (node == null) return ''
  if (typeof node === 'string' || typeof node === 'number') {
    return `${' '.repeat(indent)}${node}\n`
  }
  if (Array.isArray(node)) {
    return node
      .map((child) => formatHostTree(child, indent, ancestors))
      .join('')
  }
  if (typeof node !== 'object') return ''
  if (ancestors.includes(node)) return ''
  ancestors.push(node)

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
  const body = formatHostTree(element.children, indent + 2, ancestors)
  ancestors.pop()
  return line + body
}
