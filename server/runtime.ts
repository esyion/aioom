import { randomUUID } from 'node:crypto'
import { db } from './store/db.ts'
import { hub } from './chat/broadcast.ts'
import { createMemberRepo } from './store/members.ts'
import { createMessageRepo } from './store/messages.ts'
import { createOrchestrator } from './chat/orchestrator.ts'
import { generateReply } from './agents/mastra.ts'
import { AI_PERSONAS } from './config/agents.config.ts'

export const memberRepo = createMemberRepo(db)
export const messageRepo = createMessageRepo(db)
export const orchestrator = createOrchestrator({
  messages: messageRepo,
  members: memberRepo,
  hub,
  genId: () => randomUUID(),
  generateReply,
})

export function initAiMembers(): void {
  for (const p of AI_PERSONAS) {
    memberRepo.upsert({ id: p.id, kind: 'ai', displayName: p.displayName, avatar: p.avatar, online: true })
  }
}
