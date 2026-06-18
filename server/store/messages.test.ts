import { describe, it, expect } from 'vitest'
import { createDb } from './db.ts'
import { createMessageRepo } from './messages.ts'

function setup() {
  return createMessageRepo(createDb(':memory:'))
}

describe('messageRepo', () => {
  it('insert 返回完整消息并带 mentions', () => {
    const repo = setup()
    const msg = repo.insert({
      id: 'm1', senderId: 'u1', content: 'hi @ai_pm',
      status: 'complete', mentions: ['ai_pm'],
    })
    expect(msg.id).toBe('m1')
    expect(msg.mentions).toEqual(['ai_pm'])
    expect(msg.status).toBe('complete')
  })

  it('appendContent 累加内容', () => {
    const repo = setup()
    repo.insert({ id: 'm1', senderId: 'ai_pm', content: '', status: 'streaming' })
    repo.appendContent('m1', '你')
    repo.appendContent('m1', '好')
    expect(repo.get('m1')?.content).toBe('你好')
  })

  it('finalize 写完整内容并置 complete', () => {
    const repo = setup()
    repo.insert({ id: 'm1', senderId: 'ai_pm', content: '部分', status: 'streaming' })
    repo.finalize('m1', '完整内容')
    const m = repo.get('m1')
    expect(m?.content).toBe('完整内容')
    expect(m?.status).toBe('complete')
  })

  it('setStatus 改状态', () => {
    const repo = setup()
    repo.insert({ id: 'm1', senderId: 'ai_pm', content: '', status: 'streaming' })
    repo.setStatus('m1', 'error')
    expect(repo.get('m1')?.status).toBe('error')
  })

  it('recent 按时间升序返回最近 N 条', () => {
    const repo = setup()
    for (let i = 1; i <= 5; i++) {
      repo.insert({ id: `m${i}`, senderId: 'u1', content: `c${i}`, status: 'complete' })
    }
    const recent = repo.recent(3)
    expect(recent.map((m) => m.id)).toEqual(['m3', 'm4', 'm5'])
  })
})
