import { GIT_SHORT_SHA_DIGITS, gitHeadShortSha } from '../app.config'

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
