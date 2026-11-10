import {
  APP_VERSION,
  DEV_CLIENT_PLUGIN_CONFIG,
  GIT_SHORT_SHA_DIGITS,
  VERIFY_APK_VERSION_ENV,
  gitHeadShortSha,
  resolveApkVersion,
} from '../app.config'

describe('gitHeadShortSha', () => {
  it('asks git for the short HEAD sha', () => {
    const run = jest.fn(() => 'abc1234\n')
    expect(gitHeadShortSha('/repo', run)).toBe('abc1234')
    expect(run).toHaveBeenCalledWith(
      'git',
      ['rev-parse', `--short=${GIT_SHORT_SHA_DIGITS}`, 'HEAD'],
      expect.objectContaining({ cwd: '/repo', encoding: 'utf8' }),
    )
  })
})

describe('resolveApkVersion', () => {
  it('prefers VERIFY_APK_VERSION so Gradle and dumpsys share one stamp', () => {
    expect(
      resolveApkVersion({ [VERIFY_APK_VERSION_ENV]: '4bf1a18' }, () => 'e0543f5'),
    ).toBe('4bf1a18')
  })

  it('falls back to git HEAD when the env stamp is missing', () => {
    expect(resolveApkVersion({}, () => 'e0543f5')).toBe('e0543f5')
  })

  it('keeps a semver when git is missing so Expo config still loads', () => {
    expect(
      resolveApkVersion({}, () => {
        throw new Error('not a git repository')
      }),
    ).toBe(APP_VERSION)
  })
})

describe('DEV_CLIENT_PLUGIN_CONFIG', () => {
  it('keeps the Expo 57 developer menu from auto-opening', () => {
    expect(DEV_CLIENT_PLUGIN_CONFIG.showMenuAtLaunch).toBe(false)
    expect(DEV_CLIENT_PLUGIN_CONFIG.skipOnboarding).toBe(true)
  })
})
