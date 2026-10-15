import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatMissingEnv,
  main,
  missingRequiredEnv,
  parseDotenv,
} from './check-env.mjs'

const complete = {
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: 'web.apps.googleusercontent.com',
  EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: 'ios.apps.googleusercontent.com',
  EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME: 'com.googleusercontent.apps.123-abc',
  GOOGLE_CLIENT_ID: 'web.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'secret-do-not-print',
  GOOGLE_IOS_CLIENT_ID: 'ios.apps.googleusercontent.com',
  GOOGLE_ANDROID_CLIENT_ID: 'android.apps.googleusercontent.com',
}

describe('parseDotenv', () => {
  it('reads KEY=value lines and ignores comments and blanks', () => {
    assert.deepEqual(
      parseDotenv(
        [
          '# comment',
          '',
          'EXPO_PUBLIC_API_URL=http://localhost:3000',
          'export GOOGLE_CLIENT_ID=abc',
          "GOOGLE_CLIENT_SECRET='quoted-secret'",
        ].join('\n'),
      ),
      {
        EXPO_PUBLIC_API_URL: 'http://localhost:3000',
        GOOGLE_CLIENT_ID: 'abc',
        GOOGLE_CLIENT_SECRET: 'quoted-secret',
      },
    )
  })
})

describe('missingRequiredEnv', () => {
  it('is empty when every required Google variable is set', () => {
    assert.deepEqual(missingRequiredEnv(complete), [])
  })

  it('names every missing variable and the file it belongs in, rather than the first', () => {
    const missing = missingRequiredEnv({})
    assert.deepEqual(missing, [
      {
        name: 'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
        file: 'apps/mobile/.env',
      },
      {
        name: 'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID',
        file: 'apps/mobile/.env',
      },
      {
        name: 'EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME',
        file: 'apps/mobile/.env',
      },
      { name: 'GOOGLE_CLIENT_ID', file: 'apps/web/.env' },
      { name: 'GOOGLE_CLIENT_SECRET', file: 'apps/web/.env' },
      { name: 'GOOGLE_IOS_CLIENT_ID', file: 'apps/web/.env' },
      { name: 'GOOGLE_ANDROID_CLIENT_ID', file: 'apps/web/.env' },
    ])
  })

  it('treats blank values as missing', () => {
    const missing = missingRequiredEnv({
      ...complete,
      GOOGLE_CLIENT_ID: '  ',
      EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: '',
    })
    assert.deepEqual(
      missing.map((item) => item.name),
      ['EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', 'GOOGLE_CLIENT_ID'],
    )
  })

  it('leaves Apple off when the bundle id is unset', () => {
    assert.deepEqual(missingRequiredEnv(complete), [])
  })

  it('names the missing Apple keys in apps/web/.env once the bundle id is set', () => {
    const missing = missingRequiredEnv({
      ...complete,
      APPLE_BUNDLE_ID: 'dev.offbyonelabs.coffeecompanion',
      APPLE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nSECRET\\n-----END PRIVATE KEY-----',
    })
    assert.deepEqual(missing, [
      { name: 'APPLE_TEAM_ID', file: 'apps/web/.env' },
      { name: 'APPLE_KEY_ID', file: 'apps/web/.env' },
    ])
  })
})

describe('formatMissingEnv', () => {
  it('lists names and files and never prints secret values', () => {
    const message = formatMissingEnv(
      missingRequiredEnv({
        GOOGLE_CLIENT_SECRET: 'secret-do-not-print',
        APPLE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nSECRET\\n-----END PRIVATE KEY-----',
      }),
    )

    assert.match(
      message,
      /EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID \(apps\/mobile\/\.env\)/,
    )
    assert.match(message, /GOOGLE_CLIENT_ID \(apps\/web\/\.env\)/)
    assert.match(message, /GOOGLE_ANDROID_CLIENT_ID \(apps\/web\/\.env\)/)
    assert.doesNotMatch(message, /secret-do-not-print/)
    assert.doesNotMatch(message, /BEGIN PRIVATE KEY/)
    assert.doesNotMatch(message, /APPLE_TEAM_ID/)
  })
})

describe('main', () => {
  it('reports every missing name and file from the env files, never the values', () => {
    const root = mkdtempSync(join(tmpdir(), 'mobile-env-'))
    mkdirSync(join(root, 'apps/mobile'), { recursive: true })
    mkdirSync(join(root, 'apps/web'), { recursive: true })
    writeFileSync(
      join(root, 'apps/mobile/.env'),
      'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=ok\n',
    )
    writeFileSync(
      join(root, 'apps/web/.env'),
      [
        'GOOGLE_CLIENT_SECRET=super-secret-xyz',
        'APPLE_BUNDLE_ID=dev.offbyonelabs.coffeecompanion',
        'APPLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\\nSECRET\\n-----END PRIVATE KEY-----',
        '',
      ].join('\n'),
    )

    let out = ''
    const code = main(root, {}, (message) => {
      out = message
    })

    assert.equal(code, 1)
    assert.match(out, /EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID \(apps\/mobile\/\.env\)/)
    assert.match(out, /GOOGLE_CLIENT_ID \(apps\/web\/\.env\)/)
    assert.match(out, /GOOGLE_ANDROID_CLIENT_ID \(apps\/web\/\.env\)/)
    assert.match(out, /APPLE_TEAM_ID \(apps\/web\/\.env\)/)
    assert.match(out, /APPLE_KEY_ID \(apps\/web\/\.env\)/)
    assert.doesNotMatch(out, /super-secret-xyz/)
    assert.doesNotMatch(out, /BEGIN PRIVATE KEY/)
    assert.doesNotMatch(out, /SECRET/)
  })

  it('exits 0 when the env files cover every required variable', () => {
    const root = mkdtempSync(join(tmpdir(), 'mobile-env-ok-'))
    mkdirSync(join(root, 'apps/mobile'), { recursive: true })
    mkdirSync(join(root, 'apps/web'), { recursive: true })
    writeFileSync(
      join(root, 'apps/mobile/.env'),
      [
        'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=web.apps.googleusercontent.com',
        'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=ios.apps.googleusercontent.com',
        'EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME=com.googleusercontent.apps.123-abc',
        '',
      ].join('\n'),
    )
    writeFileSync(
      join(root, 'apps/web/.env'),
      [
        'GOOGLE_CLIENT_ID=web.apps.googleusercontent.com',
        'GOOGLE_CLIENT_SECRET=secret-do-not-print',
        'GOOGLE_IOS_CLIENT_ID=ios.apps.googleusercontent.com',
        'GOOGLE_ANDROID_CLIENT_ID=android.apps.googleusercontent.com',
        '',
      ].join('\n'),
    )

    let out = ''
    const code = main(root, {}, (message) => {
      out = message
    })

    assert.equal(code, 0)
    assert.equal(out, '')
  })
})
