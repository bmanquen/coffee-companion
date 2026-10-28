import { symmetricDecrypt, symmetricEncrypt } from 'better-auth/crypto'

export const OAUTH_TOKEN_SECRET_MISSING =
  'BETTER_AUTH_SECRET is required to store OAuth tokens.'

export function isBareHexOAuthToken(token: string) {
  return token.length % 2 === 0 && /^[0-9a-f]+$/i.test(token)
}

// better-auth’s encryptOAuthTokens uses the same envelope. Tokens we write
// ourselves (Apple native) have to match, or a later decrypt through
// better-auth would see plaintext. String-key encrypt is bare hex; decrypt
// with the current secret distinguishes live ciphertext from leftover hex.
// $ba$ is already versioned ciphertext.
export async function isEncryptedOAuthToken(token: string) {
  if (token.startsWith('$ba$')) return true
  if (!isBareHexOAuthToken(token)) return false
  const key = secret()
  if (!key) return false
  try {
    await symmetricDecrypt({ key, data: token })
    return true
  } catch {
    return false
  }
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
  if (!(await isEncryptedOAuthToken(token))) return token
  const key = secret()
  if (!key) return token
  try {
    return await symmetricDecrypt({ key, data: token })
  } catch {
    return token
  }
}
