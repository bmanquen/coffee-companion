import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { sentryTanstackStart } from '@sentry/tanstackstart-react/vite'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

// Source-map upload needs org, project, and auth token together.
function sentrySourceMaps() {
  const org = process.env.SENTRY_ORG
  const project = process.env.SENTRY_PROJECT
  const authToken = process.env.SENTRY_AUTH_TOKEN
  if (!org || !project || !authToken) return []
  return [sentryTanstackStart({ org, project, authToken })]
}

// Nitro's Rollup crashes on Sentry's dual client/server export map — leave these
// external so Node loads them from node_modules.
//
// Sentry pulls @opentelemetry/api onto the graph; better-auth then imports
// @opentelemetry/semantic-conventions. The SSR router leaves that import bare,
// so it is a direct apps/web dependency.
const sentryServerExternals = [
  /^@sentry\//,
  /^@opentelemetry\//,
  'import-in-the-middle',
  'require-in-the-middle',
]

const config = defineConfig({
  plugins: [
    devtools(),
    nitro({
      rollupConfig: {
        external: sentryServerExternals,
      },
    }),
    // this is the plugin that enables path aliases
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tailwindcss(),
    // Tests sit beside the routes they cover, and a test file is not a route.
    tanstackStart({
      router: { routeFileIgnorePattern: '\\.test\\.tsx?$' },
    }),
    viteReact({
      babel: {
        plugins: ['babel-plugin-react-compiler'],
      },
    }),
    ...sentrySourceMaps(),
  ],
})

export default config
