import { formatHostTree, jsonSafe } from './host-tree'

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

describe('formatHostTree', () => {
  it('keeps a shared child at every parent', () => {
    const child = {
      type: 'Text',
      props: { testID: 'shared-child' },
      children: ['shared'],
    }
    const tree = {
      type: 'View',
      props: { testID: 'root' },
      children: [
        { type: 'View', props: { testID: 'left' }, children: [child] },
        { type: 'View', props: { testID: 'right' }, children: [child] },
      ],
    }

    const dump = formatHostTree(tree)

    expect(dump.match(/testID=shared-child/g)).toEqual([
      'testID=shared-child',
      'testID=shared-child',
    ])
    expect(dump).toContain('testID=left')
    expect(dump).toContain('testID=right')
  })

  it('stops at a cyclic child without throwing', () => {
    const node: {
      type: string
      props: Record<string, unknown>
      children: Array<object>
    } = {
      type: 'View',
      props: { testID: 'cycle' },
      children: [],
    }
    node.children.push(node)

    expect(() => formatHostTree(node)).not.toThrow()
    expect(formatHostTree(node)).toContain('testID=cycle')
  })
})
