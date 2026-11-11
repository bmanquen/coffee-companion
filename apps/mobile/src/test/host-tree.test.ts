import { jsonSafe } from './host-tree'

describe('jsonSafe', () => {
  it('keeps a shared object at every reference', () => {
    const style = { color: 'red', fontSize: 16 }
    const tree = {
      left: { type: 'Text', props: { style } },
      right: { type: 'Text', props: { style } },
    }

    const parsed = JSON.parse(jsonSafe(tree)) as typeof tree

    expect(parsed.left.props.style).toEqual(style)
    expect(parsed.right.props.style).toEqual(style)
  })

  it('serializes a cyclic tree without throwing', () => {
    const node: { type: string; children: Array<object> } = {
      type: 'View',
      children: [],
    }
    node.children.push(node)

    expect(() => jsonSafe(node)).not.toThrow()
    const parsed = JSON.parse(jsonSafe(node)) as {
      type: string
      children: Array<unknown>
    }
    expect(parsed.type).toBe('View')
    expect(parsed.children).toEqual([null])
  })
})
