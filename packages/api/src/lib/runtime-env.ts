// Development and test honor extra trusted origins, request-log flags, and
// the E2E session bypass. Property access on the env object keeps a
// production *build* honoring process NODE_ENV at runtime (bundlers inline
// `process.env.NODE_ENV`). Unset, production, and staging stay closed.
export const E2E_AUTH_ALLOWED_NODE_ENVS = ['development', 'test'] as const

export function isDevOrTestRuntime(env: { NODE_ENV?: string } = process.env) {
  return E2E_AUTH_ALLOWED_NODE_ENVS.some((allowed) => allowed === env.NODE_ENV)
}
