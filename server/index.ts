import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { PORT } from './config/constants.ts'
import { assertModelConfig } from './config/model.config.ts'
import { initAiMembers } from './runtime.ts'
import { streamRoute } from './routes/stream.ts'

assertModelConfig()
initAiMembers()

const app = new Hono()
app.get('/api/health', (c) => c.json({ ok: true }))
app.route('/', streamRoute)

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[server] listening on http://localhost:${info.port}`)
})

export { app }
