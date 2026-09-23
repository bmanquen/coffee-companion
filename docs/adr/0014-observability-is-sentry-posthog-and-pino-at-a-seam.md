# Observability is Sentry, PostHog, and pino, handed in at a seam

The other observability tickets shipped three tools. This records which job each
one has, how they are allowed to touch the API package, how much they sample,
how a request is found again, and what a user is to them. It is not a plan; it
is what the code does today.

The stack:

- **Sentry** sees errors, sampled traces from the browser into the server, and a
  replay attached to an error.
  [ADR 0010](0010-a-replay-is-attached-to-an-error-never-to-a-session.md) is the
  replay;
  [ADR 0012](0012-sentry-names-the-user-by-account-id.md) is the user.
- **PostHog** sees product analytics: one page view per resolved navigation, and
  a closed brewing funnel.
  [ADR 0009](0009-analytics-sends-an-id-and-a-funnel-nothing-else.md) is the
  allow-list.
- **pino** writes JSON to stdout. There is no log vendor in the app. In
  development the same lines are pretty-printed.

[ADR 0011](0011-legitimate-interests-carries-the-monitoring-vendors-and-consent-is-unanswered.md)
is why Sentry and PostHog may receive even that.

## The API package never imports a vendor

`packages/api` never imports Sentry, pino, or PostHog. A static import of Sentry
puts the Node SDK on the SSR graph. An import of pino picks a logger the tests
cannot replace. PostHog is a browser SDK and has no business on the server.

What the API is handed, from `apps/web/src/instrument.server.ts`:

- `setErrorCapture` / `reportError` — when a DSN is set, the instrument captures
  with Sentry
- `setLogSink` / `log` — the same file writes through the pino instance
- `requestField` — reads `x-request-id` off the headers the server already set

The setters live in the API package. The vendors live in the instrument files,
and PostHog is injected at boot in `apps/web/src/analytics.client.ts`. Tests
hand the seams a fake. A missing DSN or PostHog key leaves that tool a no-op,
which is how local development and CI run.

## Sample rates

- **Traces.** `tracesSampleRate` is `1` outside production and `0.1` in
  production. `SENTRY_TRACES_SAMPLE_RATE` and its `VITE_` twin override that
  when the value is a number in `[0, 1]`; blank, non-numeric, negative, and
  greater-than-one values fall back. Browser transactions are named by matched
  route pattern. The server wraps fetch so an incoming request is one
  transaction, and the SDK's same-origin default continues a browser trace into
  the tRPC or auth call that caused it. Transactions pass through the same scrub
  as errors. `/api/health` is on `ignoreTransactions` — Railway polls it every
  few seconds, and a trace each time would be most of production's traffic.
- **Replay.** `replaysSessionSampleRate` is `0` and `replaysOnErrorSampleRate`
  is `1` — Sentry's buffer mode, decided in 0010.
- **Logs.** Not sampled. One JSON line per page, tRPC, and auth request
  (method, path without the query string, status, duration, request id), plus
  one line per procedure (path, type, ok, tRPC code on failure, duration, the
  same request id, and a user id when the procedure authed). Assets, favicon,
  manifest, and `/api/health` produce no request line. The level defaults to
  `info`.
- **PostHog.** Not sampled. A configured key sends every page view and every
  named funnel event.

## The request id is the correlation key

The string that ties a log line, a Sentry event, and a user's browser together
is a request id, not Sentry's trace id. The server honours an incoming
`x-request-id` and otherwise generates one. A blank header is treated as
missing. The name is one constant shared by both packages.

That id is written on the request line, spread onto every procedure line from
the request — batched calls included — and set as a Sentry `request_id` tag on
the isolation scope, so an error raised while handling the request carries it.
The response echoes the same header, which is how a browser (and anyone looking
at the network panel) holds the same string. Trace ids live in Sentry; they are
not on the response.

## Privacy stance

A user is an opaque account id — the better-auth user id — and nothing else. No
name, email, avatar, IP, cookie, body, or Coffee reaches Sentry or PostHog.
`sendDefaultPii` is off; `scrubSentryEvent` enforces the Sentry side; PostHog's
facade and `before_send` hook enforce the other. There is no session-level
replay and no autocapture. 0009, 0010, and 0012 are the detailed versions of
those rules; this is the stack-level line a new vendor or a new field is
measured against.

What we rejected:

- **A `web-vitals` package.** Sentry's browser tracing already reports LCP, CLS,
  and INP. A second library would measure the same three numbers and imply a
  pipeline that does not exist.
- **Vendors inside the API package.** The seams exist so a test can run without
  a DSN and so SSR does not load Node Sentry.
- **A log vendor, or shipping logs anywhere but stdout.** Railway reads stdout.
  A drain is an ops choice outside this repo.
- **Sampling request logs.** We skip the platform ping and the static files. We
  do not drop real traffic at random.
- **Server-side PostHog.** Every event is fired from the component that owns the
  action, after the mutation resolves.

Consequences to understand before changing anything here:

- **There is no Web Vitals dependency.** Do not add one back to "report Core Web
  Vitals." They already arrive on browser transactions.
- **A new import of Sentry, pino, or PostHog in `packages/api` contradicts this
  ADR.** Hand the package a function.
- **A fourth observability vendor is a new decision**, not a config change. So
  is turning on session-level replay or autocapture — those already have ADRs.
- **The request id is the string to ask a user for.** It is on every response.
- **CONTEXT.md gains no term.** Observability is not domain vocabulary.
- **PII in a tag, a log field, or an event property is a bug against this ADR
  and against 0009 / 0012.** A procedure line may carry a user id; it may not
  carry an email.
- **No DSN, no Sentry; no key, no PostHog; no sink, no log line.** That is the
  intended local and CI shape, not a gap.
