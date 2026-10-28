import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { account } from '../db/schema'
import {
  encryptStoredOAuthToken,
  isEncryptedOAuthToken,
} from './oauth-token'

export type TokenStore = Pick<typeof db, 'query' | 'update'>

async function encryptIfPlain(
  token: string | null,
): Promise<{ value: string | null; changed: boolean }> {
  if (!token || (await isEncryptedOAuthToken(token))) {
    return { value: token, changed: false }
  }
  return { value: await encryptStoredOAuthToken(token), changed: true }
}

// Rows written before encryptOAuthTokens stay readable as plaintext. A write
// (this pass, or the next sign-in) wraps them so a later dump is not live
// provider credentials.
export async function encryptLegacyOAuthTokens(
  store: TokenStore = db,
): Promise<number> {
  const rows = await store.query.account.findMany()
  let updated = 0
  for (const row of rows) {
    const access = await encryptIfPlain(row.accessToken)
    const refresh = await encryptIfPlain(row.refreshToken)
    const idToken = await encryptIfPlain(row.idToken)
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
  return updated
}

export function legacyOAuthEncryptionReport(updated: number) {
  if (updated === 0) return 'No plaintext OAuth tokens to encrypt.'
  return `Encrypted ${updated} legacy OAuth account row(s).`
}
