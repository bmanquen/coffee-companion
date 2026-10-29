import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { API_ENV_FILE, API_ENV_LOCAL, apiPackageEnvPath } from './load-env'

describe('apiPackageEnvPath', () => {
  it('resolves env files from the API package, not process.cwd()', () => {
    const local = apiPackageEnvPath(API_ENV_LOCAL)
    const env = apiPackageEnvPath(API_ENV_FILE)
    expect(path.isAbsolute(local)).toBe(true)
    expect(path.basename(local)).toBe(API_ENV_LOCAL)
    expect(path.basename(env)).toBe(API_ENV_FILE)
    expect(path.basename(path.dirname(local))).toBe('api')
    expect(path.basename(path.dirname(path.dirname(local)))).toBe('packages')
    expect(path.dirname(local)).toBe(path.dirname(env))
  })
})
