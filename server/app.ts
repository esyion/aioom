import { Hono } from 'hono'
import { assertModelConfig } from './config/model.config.ts'
import { initAiMembers } from './runtime.ts'
import { streamRoute } from './routes/stream.ts'
import { membersRoute } from './routes/members.ts'
import { messagesRoute } from './routes/messages.ts'

assertModelConfig()
initAiMembers()

const app = new Hono()
app.get('/api/health', (c) => c.json({ ok: true }))
app.route('/', streamRoute)
app.route('/', membersRoute)
app.route('/', messagesRoute)

export { app }
