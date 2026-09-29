import posthog from 'posthog-js'
import {
  analyticsClientKey,
  analyticsEnabled,
  analyticsHost,
  analyticsOptions,
  setAnalyticsClient,
} from './lib/analytics'
import { sentryEnvironment } from './lib/sentry'

declare global {
  interface Window {
    posthog?: typeof posthog
  }
}

const key = analyticsClientKey()
if (analyticsEnabled(key)) {
  posthog.init(key, analyticsOptions(analyticsHost()))
  posthog.register({ environment: sentryEnvironment() })
  // The snippet entrypoint puts the instance on window; the npm entrypoint does not.
  window.posthog = posthog
  setAnalyticsClient({
    capture: (event, properties) => posthog.capture(event, properties),
    identify: (id, properties) => posthog.identify(id, properties),
    reset: () => posthog.reset(),
  })
}
