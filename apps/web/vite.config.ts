import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { sentryTanstackStart } from '@sentry/tanstackstart-react/vite'
import viteReact, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
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
// so it is a direct apps/web dependency. Likewise @sentry/server-utils: with
// source-map upload on, the Sentry plugin adds a bare import of it to the server
// entry.
const sentryServerExternals = [
  /^@sentry\//,
  /^@opentelemetry\//,
  'import-in-the-middle',
  'require-in-the-middle',
]

const config = defineConfig({
  server: {
    // IPv4 loopback so the Android emulator can reach it via 10.0.2.2; not on the LAN.
    host: '127.0.0.1',
  },
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
    viteReact(),
    // plugin-react 6 dropped its babel option; the compiler runs through Rolldown's Babel plugin.
    babel({ presets: [reactCompilerPreset()] }),
    ...sentrySourceMaps(),
  ],
})

export default config
