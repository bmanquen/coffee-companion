import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const MOBILE_ENV = 'apps/mobile/.env'
const WEB_ENV = 'apps/web/.env'

const GOOGLE_MOBILE = [
  'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
  'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID',
  'EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME',
]

const GOOGLE_WEB = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_IOS_CLIENT_ID',
  'GOOGLE_ANDROID_CLIENT_ID',
]

const APPLE_WEB = ['APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY']

export function parseDotenv(text) {
  /** @type {Record<string, string>} */
  const values = {}
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const body = line.startsWith('export ')
      ? line.slice('export '.length).trim()
      : line
    const eq = body.indexOf('=')
    if (eq <= 0) continue
    const name = body.slice(0, eq).trim()
    values[name] = parseDotenvValue(body.slice(eq + 1))
  }
  return values
}

function parseDotenvValue(raw) {
  const trimmed = raw.trimStart()
  const quote = trimmed[0]
  if (quote === '"' || quote === "'") {
    const end = trimmed.indexOf(quote, 1)
    if (end !== -1) return trimmed.slice(1, end)
  }
  // dotenv: unquoted # starts a comment, including as the first character.
  const comment = raw.search(/(^|\s)#/)
  return (comment === -1 ? raw : raw.slice(0, comment)).trim()
}

function isSet(value) {
  return typeof value === 'string' && value.trim() !== ''
}

/**
 * @typedef {{ name: string, file: string, mustMatch?: string, mustMatchFile?: string }} EnvProblem
 */

/**
 * @param {Record<string, string | undefined>} env
 * @returns {Array<EnvProblem>}
 */
export function missingRequiredEnv(env) {
  /** @type {Array<EnvProblem>} */
  const missing = []
  for (const name of GOOGLE_MOBILE) {
    if (!isSet(env[name])) missing.push({ name, file: MOBILE_ENV })
  }
  for (const name of GOOGLE_WEB) {
    if (!isSet(env[name])) missing.push({ name, file: WEB_ENV })
  }
  if (isSet(env.APPLE_BUNDLE_ID)) {
    for (const name of APPLE_WEB) {
      if (!isSet(env[name])) missing.push({ name, file: WEB_ENV })
    }
  }
  // Differing Web client IDs pass presence checks but cause a Google audience error.
  const expoWebClientId = env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
  const googleClientId = env.GOOGLE_CLIENT_ID
  if (
    isSet(expoWebClientId) &&
    isSet(googleClientId) &&
    expoWebClientId.trim() !== googleClientId.trim()
  ) {
    missing.push({
      name: 'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
      file: MOBILE_ENV,
      mustMatch: 'GOOGLE_CLIENT_ID',
      mustMatchFile: WEB_ENV,
    })
  }
  return missing
}

/** @param {Array<EnvProblem>} missing */
export function formatMissingEnv(missing) {
  const absent = missing.filter((item) => !item.mustMatch)
  const mismatched = missing.filter((item) => item.mustMatch)
  /** @type {string[]} */
  const lines = []
  if (absent.length) {
    lines.push(
      'Mobile sign-in is missing required environment variables:',
      ...absent.map((item) => `  - ${item.name} (${item.file})`),
    )
  }
  for (const item of mismatched) {
    lines.push(
      `${item.name} (${item.file}) must match ${item.mustMatch} (${item.mustMatchFile}).`,
    )
  }
  return lines.join('\n')
}

function loadEnvFile(path) {
  if (!existsSync(path)) return {}
  return parseDotenv(readFileSync(path, 'utf8'))
}

function loadAppEnv(root, app) {
  return {
    ...loadEnvFile(join(root, app, '.env')),
    ...loadEnvFile(join(root, app, '.env.local')),
  }
}

function pick(name, fileEnv, env) {
  if (Object.hasOwn(env, name)) return env[name]
  return fileEnv[name]
}

export function loadMobileDevEnv(root, env = process.env) {
  const mobile = loadAppEnv(root, 'apps/mobile')
  const web = loadAppEnv(root, 'apps/web')
  /** @type {Record<string, string | undefined>} */
  const values = {}
  for (const name of GOOGLE_MOBILE) values[name] = pick(name, mobile, env)
  for (const name of [...GOOGLE_WEB, 'APPLE_BUNDLE_ID', ...APPLE_WEB]) {
    values[name] = pick(name, web, env)
  }
  return values
}

export function repoRootFrom(scriptDir) {
  return resolve(scriptDir, '../../..')
}

export function main(
  root = repoRootFrom(dirname(fileURLToPath(import.meta.url))),
  env = process.env,
  write = (message) => {
    process.stderr.write(`${message}\n`)
  },
) {
  const missing = missingRequiredEnv(loadMobileDevEnv(root, env))
  if (!missing.length) return 0
  write(formatMissingEnv(missing))
  return 1
}

const invokedDirectly =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href

if (invokedDirectly) {
  process.exitCode = main()
}
