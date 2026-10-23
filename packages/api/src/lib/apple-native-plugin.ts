import { APIError, createAuthEndpoint } from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'
import { z } from 'zod'
import {
  AppleIdentityInvalid,
  AppleNotConfigured,
  AppleSignInRefused,
  AppleTokenExchangeFailed,
  appleNativeConfig,
  signInWithAppleNative,
} from './apple'

const appleNativeBody = z.object({
  identityToken: z.string().min(1),
  authorizationCode: z.string().min(1),
  email: z.string().email().optional().nullable(),
  fullName: z
    .object({
      givenName: z.string().optional().nullable(),
      familyName: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
})

function asApiError(error: unknown): never {
  if (error instanceof AppleNotConfigured) {
    throw new APIError('SERVICE_UNAVAILABLE', { message: error.message })
  }
  if (
    error instanceof AppleIdentityInvalid ||
    error instanceof AppleTokenExchangeFailed
  ) {
    throw new APIError('UNAUTHORIZED', { message: error.message })
  }
  if (error instanceof AppleSignInRefused) {
    throw new APIError('BAD_REQUEST', { message: error.message })
  }
  throw error
}

export const appleNativeSignIn = () =>
  ({
    id: 'apple-native-sign-in',
    endpoints: {
      signInAppleNative: createAuthEndpoint(
        '/sign-in/apple-native',
        {
          method: 'POST',
          body: appleNativeBody,
        },
        async (ctx) => {
          try {
            const config = appleNativeConfig()
            if (!config) {
              throw new APIError('SERVICE_UNAVAILABLE', {
                message: 'Apple Sign In is not configured.',
              })
            }

            const signedIn = await signInWithAppleNative(ctx.body, config)
            const session = {
              session: {
                ...signedIn.session,
                userId: signedIn.user.id,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
              user: {
                ...signedIn.user,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            }
            await setSessionCookie(ctx, session)
            return ctx.json({
              token: signedIn.session.token,
              user: signedIn.user,
            })
          } catch (error) {
            asApiError(error)
          }
        },
      ),
    },
  }) as const
