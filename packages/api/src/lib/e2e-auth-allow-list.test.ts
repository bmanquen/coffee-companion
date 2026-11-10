import { describe, expect, it } from 'vitest'
import {
  E2E_USER_DELETE,
  E2E_USER_EMPTY,
  E2E_USER_FREE,
  E2E_USER_WITH_DATA,
  e2eAuthAllowList,
} from './e2e-auth-allow-list'

describe('e2eAuthAllowList', () => {
  it('contains the four personas without importing e2e-auth', () => {
    expect(e2eAuthAllowList.has(E2E_USER_WITH_DATA)).toBe(true)
    expect(e2eAuthAllowList.has(E2E_USER_EMPTY)).toBe(true)
    expect(e2eAuthAllowList.has(E2E_USER_FREE)).toBe(true)
    expect(e2eAuthAllowList.has(E2E_USER_DELETE)).toBe(true)
  })
})
