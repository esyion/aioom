import { Hono } from 'hono'
import { messageRepo, orchestrator } from '../runtime.ts'
import { MAX_MESSAGE_LENGTH, CONTEXT_WINDOW } from '../config/constants.ts'
import type { PostMessageBody } from '../../shared/types.ts'

export const messagesRoute = new Hono()

messagesRoute.post('/api/messages', async (c) => {
  const body = (await c.req.json()) as PostMessageBody
  const content = (body.content ?? '').trim()
  if (!content) return c.json({ error: '消息不能为空' }, 400)
  if (content.length > MAX_MESSAGE_LENGTH) return c.json({ error: '消息过长' }, 400)
  const message = orchestrator.handleHumanMessage({
    senderId: body.senderId,
    content,
    mentions: body.mentions ?? [],
  })
  return c.json(message)
})

messagesRoute.get('/api/messages', (c) => {
  const limit = Number(c.req.query('limit') ?? CONTEXT_WINDOW)
  return c.json(messageRepo.recent(limit))
})
