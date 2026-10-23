export const GOOGLE_PROVIDER_ID = 'google'

// Google’s email_verified claim is not enough: an Apple row can hold that
// address with emailVerified=false because the client supplied it. Linking
// then would hand the Google identity to that row.
export const accountLinking = {
  enabled: true,
  requireLocalEmailVerified: true,
  trustedProviders: [] as Array<string>,
}

export const accountOptions = {
  encryptOAuthTokens: true,
  accountLinking,
}
