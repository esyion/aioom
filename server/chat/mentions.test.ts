import { describe, it, expect } from 'vitest'
import { resolveTriggeredAis } from './mentions.ts'
import type { Member } from '../../shared/types.ts'

const ais: Member[] = [
  { id: 'ai_pm', kind: 'ai', displayName: '产品经理', avatar: '', online: true, createdAt: 1 },
  { id: 'ai_critic', kind: 'ai', displayName: '毒舌评论家', avatar: '', online: true, createdAt: 2 },
]

describe('resolveTriggeredAis', () => {
  it('无 @ → 所有 AI 都触发', () => {
    expect(resolveTriggeredAis([], ais).sort()).toEqual(['ai_critic', 'ai_pm'])
  })
  it('@ 单个 AI → 只触发该 AI', () => {
    expect(resolveTriggeredAis(['ai_pm'], ais)).toEqual(['ai_pm'])
  })
  it('@ 多个 AI → 触发被 @ 的那些', () => {
    expect(resolveTriggeredAis(['ai_pm', 'ai_critic'], ais).sort()).toEqual(['ai_critic', 'ai_pm'])
  })
  it('@ 真人(非 AI)→ 不触发任何 AI', () => {
    expect(resolveTriggeredAis(['human_xiaoming'], ais)).toEqual([])
  })
  it('@ AI + 真人混合 → 只触发被 @ 的 AI', () => {
    expect(resolveTriggeredAis(['ai_pm', 'human_xiaoming'], ais)).toEqual(['ai_pm'])
  })
  it('@ 不存在的 id → 忽略,等同未命中 AI', () => {
    expect(resolveTriggeredAis(['ghost'], ais)).toEqual([])
  })
})
