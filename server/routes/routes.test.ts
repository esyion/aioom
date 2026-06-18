import { describe, it, expect } from 'vitest'
import type { Member, Message } from '../../shared/types.ts'

// 注:本测试依赖 runtime 单例;为隔离,设置内存 DB
process.env.DB_PATH = ':memory:'
process.env.OPENAI_API_KEY = 'test-key'

const { app } = await import('../app.ts')

describe('HTTP 路由', () => {
  it('join 创建真人成员', async () => {
    const res = await app.request('/api/members/join', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: '小明' }),
    })
    expect(res.status).toBe(200)
    const m = (await res.json()) as Member
    expect(m.displayName).toBe('小明')
    expect(m.kind).toBe('human')
    expect(m.id).toMatch(/^human_/)
  })

  it('空消息返回 400', async () => {
    const res = await app.request('/api/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ senderId: 'u1', content: '   ', mentions: [] }),
    })
    expect(res.status).toBe(400)
  })

  it('正常消息返回 200 且落库', async () => {
    const res = await app.request('/api/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ senderId: 'u1', content: '大家好', mentions: ['human_only'] }),
    })
    expect(res.status).toBe(200)
    const msg = (await res.json()) as Message
    expect(msg.content).toBe('大家好')
  })

  it('GET /api/messages 返回数组', async () => {
    const res = await app.request('/api/messages?limit=10')
    expect(res.status).toBe(200)
    expect(Array.isArray(await res.json())).toBe(true)
  })
})
