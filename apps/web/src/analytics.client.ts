import posthog from 'posthog-js'
import {
  analyticsClientKey,
  analyticsEnabled,
  analyticsHost,
  analyticsOptions,
  setAnalyticsClient,
} from './lib/analytics'
import { sentryEnvironment } from './lib/sentry'

const key = analyticsClientKey()
if (analyticsEnabled(key)) {
  posthog.init(key, analyticsOptions(analyticsHost()))
  posthog.register({ environment: sentryEnvironment() })
  setAnalyticsClient({
    capture: (event, properties) => posthog.capture(event, properties),
    identify: (id, properties) => posthog.identify(id, properties),
    reset: () => posthog.reset(),
  })
}
