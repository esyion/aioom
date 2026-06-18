import type { MessageRepo } from '../store/messages.ts'
import type { MemberRepo } from '../store/members.ts'
import type { BroadcastHub } from './broadcast.ts'
import type { Message, PostMessageBody } from '../../shared/types.ts'
import { CONTEXT_WINDOW } from '../config/constants.ts'
import { resolveTriggeredAis } from './mentions.ts'
import { buildContext } from './context.ts'

interface Deps {
  messages: MessageRepo
  members: MemberRepo
  hub: BroadcastHub
  genId: () => string
  generateReply: (
    agentId: string,
    context: { role: 'user' | 'assistant'; content: string }[],
    onDelta: (chunk: string) => void,
  ) => Promise<string>
}

export function createOrchestrator(deps: Deps) {
  const { messages, members, hub, genId, generateReply } = deps

  async function runAi(aiId: string, replyTo: string): Promise<void> {
    const id = genId()
    messages.insert({ id, senderId: aiId, content: '', status: 'streaming', replyTo })
    hub.broadcast({ type: 'message:new', message: messages.get(id)! })
    try {
      const ctx = buildContext(messages.recent(CONTEXT_WINDOW), members.list(), aiId)
      const full = await generateReply(aiId, ctx, (chunk) => {
        messages.appendContent(id, chunk)
        hub.broadcast({ type: 'message:delta', messageId: id, chunk })
      })
      messages.finalize(id, full)
      hub.broadcast({ type: 'message:done', messageId: id, content: full })
    } catch (err) {
      messages.setStatus(id, 'error')
      hub.broadcast({
        type: 'message:error',
        messageId: id,
        error: err instanceof Error ? err.message : '生成失败',
      })
    }
  }

  function handleHumanMessage(body: PostMessageBody): Message {
    const id = genId()
    const message = messages.insert({
      id, senderId: body.senderId, content: body.content,
      status: 'complete', mentions: body.mentions,
    })
    hub.broadcast({ type: 'message:new', message })

    const triggered = resolveTriggeredAis(body.mentions, members.listAi())
    // 并行触发,不阻塞 HTTP 返回
    for (const aiId of triggered) void runAi(aiId, id)
    return message
  }

  return { handleHumanMessage, runAi }
}

export type Orchestrator = ReturnType<typeof createOrchestrator>
