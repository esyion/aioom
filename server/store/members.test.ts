import { describe, it, expect } from 'vitest'
import { createDb } from './db.ts'
import { createMemberRepo } from './members.ts'

function setup() {
  return createMemberRepo(createDb(':memory:'))
}

describe('memberRepo', () => {
  it('upsert 后能 get 到', () => {
    const repo = setup()
    repo.upsert({ id: 'ai_pm', kind: 'ai', displayName: '产品经理', avatar: '📋', online: true })
    const m = repo.get('ai_pm')
    expect(m?.displayName).toBe('产品经理')
    expect(m?.kind).toBe('ai')
    expect(m?.online).toBe(true)
  })

  it('upsert 同 id 覆盖而非重复', () => {
    const repo = setup()
    repo.upsert({ id: 'u1', kind: 'human', displayName: '小明', avatar: '', online: true })
    repo.upsert({ id: 'u1', kind: 'human', displayName: '小明明', avatar: '', online: true })
    expect(repo.list()).toHaveLength(1)
    expect(repo.get('u1')?.displayName).toBe('小明明')
  })

  it('setOnline 切换在线状态', () => {
    const repo = setup()
    repo.upsert({ id: 'u1', kind: 'human', displayName: '小明', avatar: '', online: true })
    repo.setOnline('u1', false)
    expect(repo.get('u1')?.online).toBe(false)
  })

  it('listAi 只返回 AI 成员', () => {
    const repo = setup()
    repo.upsert({ id: 'u1', kind: 'human', displayName: '小明', avatar: '', online: true })
    repo.upsert({ id: 'ai_pm', kind: 'ai', displayName: '产品经理', avatar: '📋', online: true })
    const ais = repo.listAi()
    expect(ais).toHaveLength(1)
    expect(ais[0].id).toBe('ai_pm')
  })
})
