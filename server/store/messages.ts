import type Database from 'better-sqlite3'
import type { Message, MessageStatus } from '../../shared/types.ts'

interface MessageRow {
  id: string
  sender_id: string
  content: string
  status: MessageStatus
  reply_to: string | null
  created_at: number
}

export function createMessageRepo(db: Database.Database) {
  function mentionsOf(messageId: string): string[] {
    const rows = db
      .prepare('SELECT member_id FROM mentions WHERE message_id = ?')
      .all(messageId) as { member_id: string }[]
    return rows.map((r) => r.member_id)
  }

  function toMessage(r: MessageRow): Message {
    return {
      id: r.id,
      senderId: r.sender_id,
      content: r.content,
      status: r.status,
      replyTo: r.reply_to,
      createdAt: r.created_at,
      mentions: mentionsOf(r.id),
    }
  }

  return {
    insert(m: {
      id: string; senderId: string; content: string; status: MessageStatus
      replyTo?: string | null; mentions?: string[]
    }): Message {
      const createdAt = Date.now()
      db.prepare(
        `INSERT INTO messages (id, sender_id, content, status, reply_to, created_at)
         VALUES (?,?,?,?,?,?)`,
      ).run(m.id, m.senderId, m.content, m.status, m.replyTo ?? null, createdAt)
      const insertMention = db.prepare(
        'INSERT OR IGNORE INTO mentions (message_id, member_id) VALUES (?,?)',
      )
      for (const memberId of m.mentions ?? []) insertMention.run(m.id, memberId)
      return {
        id: m.id, senderId: m.senderId, content: m.content, status: m.status,
        replyTo: m.replyTo ?? null, createdAt, mentions: m.mentions ?? [],
      }
    },
    appendContent(id: string, chunk: string): void {
      db.prepare('UPDATE messages SET content = content || ? WHERE id = ?').run(chunk, id)
    },
    setStatus(id: string, status: MessageStatus): void {
      db.prepare('UPDATE messages SET status = ? WHERE id = ?').run(status, id)
    },
    finalize(id: string, content: string): void {
      db.prepare("UPDATE messages SET content = ?, status = 'complete' WHERE id = ?").run(content, id)
    },
    get(id: string): Message | undefined {
      const r = db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as MessageRow | undefined
      return r ? toMessage(r) : undefined
    },
    recent(limit: number): Message[] {
      const rows = db
        .prepare('SELECT * FROM messages ORDER BY created_at DESC LIMIT ?')
        .all(limit) as MessageRow[]
      return rows.reverse().map(toMessage)
    },
  }
}

export type MessageRepo = ReturnType<typeof createMessageRepo>
