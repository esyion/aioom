import type Database from 'better-sqlite3'
import type { Member, MemberKind } from '../../shared/types.ts'

interface MemberRow {
  id: string
  kind: MemberKind
  display_name: string
  avatar: string
  online: number
  created_at: number
}

function toMember(r: MemberRow): Member {
  return {
    id: r.id,
    kind: r.kind,
    displayName: r.display_name,
    avatar: r.avatar,
    online: r.online === 1,
    createdAt: r.created_at,
  }
}

export function createMemberRepo(db: Database.Database) {
  return {
    upsert(m: { id: string; kind: MemberKind; displayName: string; avatar: string; online: boolean }): void {
      db.prepare(
        `INSERT INTO members (id, kind, display_name, avatar, online, created_at)
         VALUES (@id, @kind, @displayName, @avatar, @online, @createdAt)
         ON CONFLICT(id) DO UPDATE SET
           kind=excluded.kind,
           display_name=excluded.display_name,
           avatar=excluded.avatar,
           online=excluded.online`,
      ).run({
        id: m.id,
        kind: m.kind,
        displayName: m.displayName,
        avatar: m.avatar,
        online: m.online ? 1 : 0,
        createdAt: Date.now(),
      })
    },
    setOnline(id: string, online: boolean): void {
      db.prepare('UPDATE members SET online = ? WHERE id = ?').run(online ? 1 : 0, id)
    },
    get(id: string): Member | undefined {
      const r = db.prepare('SELECT * FROM members WHERE id = ?').get(id) as MemberRow | undefined
      return r ? toMember(r) : undefined
    },
    list(): Member[] {
      const rows = db.prepare('SELECT * FROM members ORDER BY created_at ASC').all() as MemberRow[]
      return rows.map(toMember)
    },
    listAi(): Member[] {
      const rows = db.prepare("SELECT * FROM members WHERE kind = 'ai' ORDER BY created_at ASC").all() as MemberRow[]
      return rows.map(toMember)
    },
  }
}

export type MemberRepo = ReturnType<typeof createMemberRepo>
