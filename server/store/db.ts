import Database from 'better-sqlite3'

export function createDb(path: string): Database.Database {
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      display_name TEXT NOT NULL,
      avatar TEXT NOT NULL DEFAULT '',
      online INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      sender_id TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT NOT NULL,
      reply_to TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS mentions (
      message_id TEXT NOT NULL,
      member_id TEXT NOT NULL,
      PRIMARY KEY (message_id, member_id)
    );
    CREATE INDEX IF NOT EXISTS idx_messages_created ON messages (created_at);
  `)
  return db
}

export const db = createDb(process.env.DB_PATH ?? 'data.sqlite')
