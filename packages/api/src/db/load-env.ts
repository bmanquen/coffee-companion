import { config } from 'dotenv'

// Same files drizzle-kit and the db singleton read. Relative to the API
// package root, which is cwd for `pnpm db:migrate`.
config({ path: '.env.local' })
config({ path: '.env' })
