import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { sentryTanstackStart } from '@sentry/tanstackstart-react/vite'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

// Source-map upload is optional and needs all three. Without them the plugin
// is omitted so a fresh clone and CI still build.
function sentrySourceMaps() {
  const org = process.env.SENTRY_ORG
  const project = process.env.SENTRY_PROJECT
  const authToken = process.env.SENTRY_AUTH_TOKEN
  if (!org || !project || !authToken) return []
  return [sentryTanstackStart({ org, project, authToken })]
}

const config = defineConfig({
  plugins: [
    devtools(),
    nitro(),
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
