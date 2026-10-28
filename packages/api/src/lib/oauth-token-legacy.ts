import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { account } from '../db/schema'
import {
  encryptStoredOAuthToken,
  isBareHexOAuthToken,
  isEncryptedOAuthToken,
} from './oauth-token'

export type TokenStore = Pick<typeof db, 'query' | 'update'>

export type LegacyOAuthEncryptionResult = {
  updated: number
  skippedUndecryptable: number
}

async function encryptIfPlain(
  token: string | null,
): Promise<{
  value: string | null
  changed: boolean
  skippedUndecryptable: boolean
}> {
  if (!token || (await isEncryptedOAuthToken(token))) {
    return { value: token, changed: false, skippedUndecryptable: false }
  }
  // Bare hex that the current secret cannot decrypt is either leftover
  // ciphertext from another key or ambiguous plaintext. Google/Apple tokens
  // are not pure hex, so leaving it unchanged is safe; wrapping it would
  // destroy a rotated-secret row on every migrate.
  if (isBareHexOAuthToken(token)) {
    return { value: token, changed: false, skippedUndecryptable: true }
  }
  return {
    value: await encryptStoredOAuthToken(token),
    changed: true,
    skippedUndecryptable: false,
  }
}

// Rows written before encryptOAuthTokens stay readable as plaintext. A write
// (this pass, or the next sign-in) wraps them so a later dump is not live
// provider credentials.
export async function encryptLegacyOAuthTokens(
  store: TokenStore = db,
): Promise<LegacyOAuthEncryptionResult> {
  const rows = await store.query.account.findMany()
  let updated = 0
  let skippedUndecryptable = 0
  for (const row of rows) {
    const access = await encryptIfPlain(row.accessToken)
    const refresh = await encryptIfPlain(row.refreshToken)
    const idToken = await encryptIfPlain(row.idToken)
    skippedUndecryptable += Number(access.skippedUndecryptable)
    skippedUndecryptable += Number(refresh.skippedUndecryptable)
    skippedUndecryptable += Number(idToken.skippedUndecryptable)
    if (!access.changed && !refresh.changed && !idToken.changed) continue

    const set: {
      accessToken?: string | null
      refreshToken?: string | null
      idToken?: string | null
    } = {}
    const predicates = [eq(account.id, row.id)]
    if (access.changed && row.accessToken) {
      set.accessToken = access.value
      predicates.push(eq(account.accessToken, row.accessToken))
    }
    if (refresh.changed && row.refreshToken) {
      set.refreshToken = refresh.value
      predicates.push(eq(account.refreshToken, row.refreshToken))
    }
    if (idToken.changed && row.idToken) {
      set.idToken = idToken.value
      predicates.push(eq(account.idToken, row.idToken))
    }
    if (Object.keys(set).length === 0) continue

    const result = await store
      .update(account)
      .set(set)
      .where(and(...predicates))
      .returning({ id: account.id })
    updated += result.length
  }
  return { updated, skippedUndecryptable }
}

export function legacyOAuthEncryptionReport(
  result: LegacyOAuthEncryptionResult,
) {
  const parts = [
    result.updated === 0
      ? 'No plaintext OAuth tokens to encrypt.'
      : `Encrypted ${result.updated} legacy OAuth account row(s).`,
  ]
  if (result.skippedUndecryptable > 0) {
    parts.push(`skipped_undecryptable=${result.skippedUndecryptable}`)
  }
  return parts.join(' ')
}
