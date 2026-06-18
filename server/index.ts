import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { PORT } from './config/constants.ts'

const app = new Hono()

app.get('/api/health', (c) => c.json({ ok: true }))

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[server] listening on http://localhost:${info.port}`)
})

export { app }
