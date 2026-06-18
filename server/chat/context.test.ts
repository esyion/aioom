import { describe, it, expect } from 'vitest'
import { buildContext } from './context.ts'
import type { Message, Member } from '../../shared/types.ts'

const members: Member[] = [
  { id: 'u1', kind: 'human', displayName: '小明', avatar: '', online: true, createdAt: 1 },
  { id: 'ai_pm', kind: 'ai', displayName: '产品经理', avatar: '', online: true, createdAt: 2 },
]
function msg(id: string, senderId: string, content: string): Message {
  return { id, senderId, content, status: 'complete', replyTo: null, createdAt: 0, mentions: [] }
}

describe('buildContext', () => {
  it('他人发言标注显示名作为 user,自己发言作为 assistant', () => {
    const ctx = buildContext(
      [msg('m1', 'u1', '这个功能怎么做?'), msg('m2', 'ai_pm', '建议先做MVP')],
      members, 'ai_pm',
    )
    expect(ctx).toEqual([
      { role: 'user', content: '小明: 这个功能怎么做?' },
      { role: 'assistant', content: '建议先做MVP' },
    ])
  })

  it('未知发送者用 id 兜底', () => {
    const ctx = buildContext([msg('m1', 'ghost', '嗨')], members, 'ai_pm')
    expect(ctx).toEqual([{ role: 'user', content: 'ghost: 嗨' }])
  })

  it('跳过 streaming 占位空消息(自己尚未生成的)', () => {
    const streaming: Message = { id: 'm9', senderId: 'ai_pm', content: '', status: 'streaming', replyTo: null, createdAt: 9, mentions: [] }
    const ctx = buildContext([msg('m1', 'u1', '在吗'), streaming], members, 'ai_pm')
    expect(ctx).toEqual([{ role: 'user', content: '小明: 在吗' }])
  })
})
