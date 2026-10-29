import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'

export const API_ENV_LOCAL = '.env.local'
export const API_ENV_FILE = '.env'

export function apiPackageEnvPath(filename: string) {
  return fileURLToPath(new URL(`../../${filename}`, import.meta.url))
}

// The web app imports the db singleton with cwd under apps/web. These files
// live on the API package, so resolve from this module, not process.cwd().
config({ path: apiPackageEnvPath(API_ENV_LOCAL) })
config({ path: apiPackageEnvPath(API_ENV_FILE) })
