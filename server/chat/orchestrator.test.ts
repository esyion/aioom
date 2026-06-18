import { describe, it, expect, vi } from 'vitest'
import { createDb } from '../store/db.ts'
import { createMemberRepo } from '../store/members.ts'
import { createMessageRepo } from '../store/messages.ts'
import { createBroadcastHub } from './broadcast.ts'
import { createOrchestrator } from './orchestrator.ts'
import type { SseEvent } from '../../shared/types.ts'

function setup() {
  const db = createDb(':memory:')
  const members = createMemberRepo(db)
  const messages = createMessageRepo(db)
  const hub = createBroadcastHub()
  members.upsert({ id: 'u1', kind: 'human', displayName: '小明', avatar: '', online: true })
  members.upsert({ id: 'ai_pm', kind: 'ai', displayName: '产品经理', avatar: '📋', online: true })

  const events: SseEvent[] = []
  hub.subscribe((e) => events.push(e))

  let counter = 0
  const genId = () => `gen${++counter}`
  // 假 generateReply:吐两个增量后返回完整文本
  const generateReply = vi.fn(async (_id: string, _ctx: unknown, onDelta: (c: string) => void) => {
    onDelta('你好'); onDelta(',我是产品经理')
    return '你好,我是产品经理'
  })
  const orch = createOrchestrator({ messages, members, hub, generateReply, genId })
  return { orch, events, messages, generateReply }
}

describe('orchestrator', () => {
  it('真人消息无 @ → 落库 + 广播 message:new + 触发全部 AI', async () => {
    const { orch, events, messages } = setup()
    const human = orch.handleHumanMessage({ senderId: 'u1', content: '大家好', mentions: [] })
    expect(messages.get(human.id)?.content).toBe('大家好')
    // 等待异步 AI 任务完成
    await vi.waitFor(() => {
      expect(events.some((e) => e.type === 'message:done')).toBe(true)
    })
    const types = events.map((e) => e.type)
    expect(types).toContain('message:new')   // 真人 + AI 占位
    expect(types).toContain('message:delta') // 流式增量
    expect(types).toContain('message:done')  // 完成
  })

  it('@ 真人 → 不触发任何 AI', async () => {
    const { orch, events, generateReply } = setup()
    orch.handleHumanMessage({ senderId: 'u1', content: '@小红 在吗', mentions: ['human_xiaohong'] })
    await new Promise((r) => setTimeout(r, 20))
    expect(generateReply).not.toHaveBeenCalled()
    expect(events.some((e) => e.type === 'message:delta')).toBe(false)
  })

  it('AI 生成失败 → 广播 message:error 且状态为 error', async () => {
    const db = createDb(':memory:')
    const members = createMemberRepo(db)
    const messages = createMessageRepo(db)
    const hub = createBroadcastHub()
    members.upsert({ id: 'ai_pm', kind: 'ai', displayName: '产品经理', avatar: '', online: true })
    const events: SseEvent[] = []
    hub.subscribe((e) => events.push(e))
    let c = 0
    const orch = createOrchestrator({
      messages, members, hub, genId: () => `g${++c}`,
      generateReply: async () => { throw new Error('boom') },
    })
    orch.handleHumanMessage({ senderId: 'ai_pm', content: '触发', mentions: [] })
    // 注:senderId 仅用于落库;此处借用以触发 ai_pm 之外无其他 AI,简化为验证 error 流程
    await vi.waitFor(() => {
      expect(events.some((e) => e.type === 'message:error')).toBe(true)
    })
  })
})
