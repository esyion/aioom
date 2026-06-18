import { serve } from '@hono/node-server'
import { PORT } from './config/constants.ts'
import { app } from './app.ts'

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[server] listening on http://localhost:${info.port}`)
})
