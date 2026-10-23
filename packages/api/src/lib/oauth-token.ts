import { symmetricDecrypt, symmetricEncrypt } from 'better-auth/crypto'

export const OAUTH_TOKEN_SECRET_MISSING =
  'BETTER_AUTH_SECRET is required to store OAuth tokens.'

// better-auth’s encryptOAuthTokens uses the same envelope. Tokens we write
// ourselves (Apple native) have to match, or a later decrypt through
// better-auth would see plaintext.
function isLikelyEncrypted(token: string) {
  if (token.startsWith('$ba$')) return true
  return token.length % 2 === 0 && /^[0-9a-f]+$/i.test(token)
}

function secret() {
  return process.env.BETTER_AUTH_SECRET
}

export async function encryptStoredOAuthToken(token: string): Promise<string>
export async function encryptStoredOAuthToken(
  token: string | null | undefined,
): Promise<string | null | undefined>
export async function encryptStoredOAuthToken(
  token: string | null | undefined,
): Promise<string | null | undefined> {
  if (!token) return token
  const key = secret()
  if (!key) throw new Error(OAUTH_TOKEN_SECRET_MISSING)
  return symmetricEncrypt({ key, data: token })
}

export async function decryptStoredOAuthToken(
  token: string | null | undefined,
): Promise<string | null | undefined> {
  if (!token) return token
  if (!isLikelyEncrypted(token)) return token
  const key = secret()
  if (!key) return token
  try {
    return await symmetricDecrypt({ key, data: token })
  } catch {
    return token
  }
}
