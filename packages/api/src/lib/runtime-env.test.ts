import { describe, expect, it } from 'vitest'
import {
  E2E_AUTH_ALLOWED_NODE_ENVS,
  isDevOrTestRuntime,
} from './runtime-env'

describe('isDevOrTestRuntime', () => {
  it('treats only development and test as dev-or-test runtimes', () => {
    expect(E2E_AUTH_ALLOWED_NODE_ENVS).toEqual(['development', 'test'])
    expect(isDevOrTestRuntime({ NODE_ENV: 'test' })).toBe(true)
    expect(isDevOrTestRuntime({ NODE_ENV: 'development' })).toBe(true)
    for (const nodeEnv of [undefined, 'production', 'staging'] as const) {
      expect(isDevOrTestRuntime({ NODE_ENV: nodeEnv })).toBe(false)
    }
  })
})
