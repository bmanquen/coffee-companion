import { eq } from 'drizzle-orm'
import { db } from '../db'
import { account } from '../db/schema'
import {
  encryptStoredOAuthToken,
  isEncryptedOAuthToken,
} from './oauth-token'

type TokenStore = Pick<typeof db, 'query' | 'update'>

async function encryptIfPlain(
  token: string | null,
): Promise<{ value: string | null; changed: boolean }> {
  if (!token || isEncryptedOAuthToken(token)) {
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
    await store
      .update(account)
      .set({
        accessToken: access.value,
        refreshToken: refresh.value,
        idToken: idToken.value,
      })
      .where(eq(account.id, row.id))
    updated += 1
  }
  return updated
}
