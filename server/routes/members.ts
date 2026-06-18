import { Hono } from 'hono'
import { randomUUID } from 'node:crypto'
import { memberRepo } from '../runtime.ts'
import { hub } from '../chat/broadcast.ts'
import type { JoinBody, SseEvent } from '../../shared/types.ts'

export const membersRoute = new Hono()

membersRoute.post('/api/members/join', async (c) => {
  const body = (await c.req.json()) as JoinBody
  const displayName = (body.displayName ?? '').trim()
  if (!displayName) return c.json({ error: '昵称不能为空' }, 400)
  const id = `human_${randomUUID()}`
  memberRepo.upsert({ id, kind: 'human', displayName, avatar: '', online: true })
  hub.broadcast({ type: 'presence', members: memberRepo.list() } satisfies SseEvent)
  return c.json(memberRepo.get(id))
})

membersRoute.get('/api/members', (c) => c.json(memberRepo.list()))
