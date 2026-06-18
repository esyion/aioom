import { describe, it, expect } from 'vitest'
import { createDb } from './db.ts'

describe('createDb', () => {
  it('创建三张表', () => {
    const db = createDb(':memory:')
    const rows = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      )
      .all() as { name: string }[]
    const names = rows.map((r) => r.name)
    expect(names).toContain('members')
    expect(names).toContain('messages')
    expect(names).toContain('mentions')
  })

  it('messages 表可写入并读回', () => {
    const db = createDb(':memory:')
    db.prepare(
      "INSERT INTO messages (id, sender_id, content, status, reply_to, created_at) VALUES (?,?,?,?,?,?)",
    ).run('m1', 'u1', 'hi', 'complete', null, 1000)
    const row = db.prepare('SELECT * FROM messages WHERE id = ?').get('m1') as {
      content: string
    }
    expect(row.content).toBe('hi')
  })
})
