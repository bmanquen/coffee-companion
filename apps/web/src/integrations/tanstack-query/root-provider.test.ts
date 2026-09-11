import { describe, expect, it } from 'vitest'
import { getContext } from './root-provider'

// On the server one process serves everybody, and the batch link merges the
// calls that reach one client in the same tick into a single HTTP request —
// which carries a single cookie. A client shared between contexts therefore
// answers two readers with one reader's rows.
describe('the context a request is served with', () => {
  it('carries a tRPC client of its own', () => {
    expect(getContext().trpcClient).not.toBe(getContext().trpcClient)
  })
})
