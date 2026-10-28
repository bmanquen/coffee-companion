import '../db/load-env'
import { db } from '../db'
import {
  encryptLegacyOAuthTokens,
  legacyOAuthEncryptionReport,
} from './oauth-token-legacy'

try {
  const result = await encryptLegacyOAuthTokens()
  console.log(legacyOAuthEncryptionReport(result))
} catch {
  // The encrypt helper never includes token values; keep the failure line
  // the same so a deploy log cannot leak a row that failed mid-write.
  console.error('Encrypting legacy OAuth tokens failed.')
  process.exitCode = 1
} finally {
  await db.$client.end()
}
