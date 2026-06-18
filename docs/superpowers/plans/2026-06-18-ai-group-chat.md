# AI 群聊功能 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 Vite + React 19 + TS 模板上,新增 Hono 后端,实现单一固定大群的实时群聊,群内多个真人与多个 AI 共存,按 @ 规则触发 AI 流式回复。

**Architecture:** 单 Node 进程分四层(路由 / 群聊核心 / Mastra 编排 / SQLite 存储)。真人发消息走 HTTP POST;所有人通过 SSE 长连接接收一切(他人消息、AI 流式增量、上下线)。群消息以自己的 `messages` 表为唯一真相来源,AI 回复时取最近 N 条组装上下文传给 Mastra agent 的 `.stream()`。

**Tech Stack:** Hono(后端 + SSE)、Mastra(AI agent 编排)、better-sqlite3(持久化)、Vitest(测试)、React 19 + Vite(前端)、tsx(后端开发态运行)。

设计来源:`docs/superpowers/specs/2026-06-18-ai-group-chat-design.md`

## Global Constraints

- **包管理器**:pnpm(用户全局约定,Node 项目优先 pnpm)。
- **后端 TS 编译目标**:Mastra 要求 `target: ES2022`、`module: ES2022`、`moduleResolution: bundler`。后端用独立的 `tsconfig.server.json`,不复用前端的 `tsconfig.app.json`。
- **前端 tsconfig**:现有 `tsconfig.app.json` 为 es2023/esnext/bundler,`verbatimModuleSyntax: true`(类型导入须用 `import type`)。
- **模型名不凭记忆写死**:OpenAI 具体模型名在装包后用 `node_modules/@mastra` embedded docs / provider registry 核实,代码中通过 `process.env.OPENAI_MODEL` 注入,配置文件给一个占位默认值。
- **Mastra 流式 API 以装包后的 embedded docs 为准**:本计划基于官方远程文档写 `agent.stream(messages)` + `for await (chunk of stream.textStream)`;`.stream()` 面向 V2 模型,若装包后 embedded docs 显示该版本用 `.streamLegacy()` 或方法名不同,以 embedded docs 为准修正(见 Task 7 步骤)。
- **API Key 走 `.env`**,`.env` 加入 `.gitignore`,绝不写进代码或提交。
- **端到端类型安全**:前后端共用 `shared/` 下的 TS 类型定义。
- **每条消息可 @ 多人**;**只解析真人发送时前端传来的 member_id 列表,绝不解析 AI 消息内容里的 @**(杜绝 AI 互相 @ 死循环,硬规则)。
- **上下文窗口**:默认取最近 50 条消息喂给 AI,经 `CONTEXT_WINDOW` 常量配置。

---

## 文件结构总览

**后端(新增 `server/`)**
- `server/index.ts` — Hono 入口,挂载路由,启动 HTTP server(端口 3001)。
- `server/config/model.config.ts` — OpenAI 兼容层模型配置(读 env)。
- `server/config/agents.config.ts` — AI 人设数组(可改)。
- `server/config/constants.ts` — `CONTEXT_WINDOW`、端口、消息长度上限等常量。
- `server/store/db.ts` — better-sqlite3 连接 + 建表 DDL。
- `server/store/members.ts` — 成员仓储(upsert/查询/上下线)。
- `server/store/messages.ts` — 消息仓储(插入/状态流转/最近 N 条/mentions)。
- `server/chat/mentions.ts` — 触发规则纯函数(给定 mentions + 成员 → 应触发哪些 AI)。
- `server/chat/broadcast.ts` — 广播中心(BroadcastHub)。
- `server/chat/context.ts` — 把 messages 行组装成 Mastra 消息数组(标注发言人)。
- `server/chat/orchestrator.ts` — 编排:写库 → 广播 → 触发 → 调 generateReply。
- `server/agents/mastra.ts` — 构建 Mastra 实例 + 各 AI agent;`generateReply` 函数。
- `server/routes/messages.ts` — `POST /api/messages`、`GET /api/messages`。
- `server/routes/stream.ts` — `GET /api/stream`(SSE)。
- `server/routes/members.ts` — `GET /api/members`、`POST /api/members/join`。

**共享类型(新增 `shared/`)**
- `shared/types.ts` — `Member`、`Message`、`MessageStatus`、`SseEvent` 联合类型等。

**前端(改造 `src/`)**
- `src/api/client.ts` — 调后端 HTTP 封装。
- `src/hooks/useChatStream.ts` — SSE 订阅 hook,维护消息列表与在线成员。
- `src/components/MessageList.tsx` — 消息列表(含流式气泡)。
- `src/components/Composer.tsx` — 输入框 + @ 选择。
- `src/components/MemberList.tsx` — 成员侧栏。
- `src/components/JoinDialog.tsx` — 起昵称进群。
- `src/App.tsx` — 改造为聊天主界面。

**配置/工程**
- `tsconfig.server.json` — 后端独立 tsconfig(ES2022)。
- `vitest.config.ts` — 测试配置。
- `package.json` — 新增依赖与脚本(dev / dev:server / test)。
- `vite.config.ts` — 加 `/api` proxy 到 3001。
- `.env.example`、`.gitignore` — 环境变量样板与忽略规则。

---

## Task 1: 后端工程脚手架与依赖

**Files:**
- Create: `tsconfig.server.json`
- Create: `.env.example`
- Modify: `_gitignore`(项目用 `_gitignore` 作为忽略文件名)
- Modify: `package.json`(加依赖与脚本)
- Modify: `vite.config.ts`(加 `/api` proxy)
- Create: `server/config/constants.ts`
- Create: `server/index.ts`(最小可启动版)

**Interfaces:**
- Consumes: 无(首个任务)。
- Produces: 可运行的 `pnpm dev:server` 启动一个 Hono 服务,`GET /api/health` 返回 `{ ok: true }`;`server/config/constants.ts` 导出 `PORT=3001`、`CONTEXT_WINDOW=50`、`MAX_MESSAGE_LENGTH=4000`。

- [ ] **Step 1: 安装依赖**

```bash
pnpm add hono @hono/node-server better-sqlite3 @mastra/core
pnpm add -D tsx vitest @types/better-sqlite3
```

- [ ] **Step 2: 创建后端 tsconfig(Mastra 要求 ES2022)**

`tsconfig.server.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "types": ["node"],
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "verbatimModuleSyntax": false
  },
  "include": ["server", "shared"]
}
```

- [ ] **Step 3: 常量文件**

`server/config/constants.ts`:

```ts
export const PORT = Number(process.env.PORT ?? 3001)
export const CONTEXT_WINDOW = 50
export const MAX_MESSAGE_LENGTH = 4000
```

- [ ] **Step 4: 最小 Hono 入口**

`server/index.ts`:

```ts
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { PORT } from './config/constants.ts'

const app = new Hono()

app.get('/api/health', (c) => c.json({ ok: true }))

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[server] listening on http://localhost:${info.port}`)
})

export { app }
```

- [ ] **Step 5: package.json 脚本**

在 `package.json` 的 `scripts` 中新增(保留现有 dev/build/lint/preview):

```json
{
  "scripts": {
    "dev:server": "tsx watch server/index.ts",
    "dev:web": "vite",
    "dev": "vite",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

> 注:保留原 `"dev": "vite"`。前后端同时起在 Task 15 用并发脚本完善;此处先各自可独立启动。

- [ ] **Step 6: Vite proxy**

`vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
```

- [ ] **Step 7: .env.example 与 gitignore**

`.env.example`:

```
OPENAI_API_KEY=sk-xxxxx
OPENAI_BASE_URL=
OPENAI_MODEL=
PORT=3001
```

在 `_gitignore` 末尾追加:

```
.env
*.sqlite
*.sqlite-journal
```

- [ ] **Step 8: 启动验证**

Run: `pnpm dev:server`,另开终端 `curl http://localhost:3001/api/health`
Expected: 控制台打印 `[server] listening on http://localhost:3001`;curl 返回 `{"ok":true}`。手动 Ctrl-C 停止。

- [ ] **Step 9: Commit**

```bash
git add tsconfig.server.json .env.example _gitignore package.json pnpm-lock.yaml vite.config.ts server/
git commit -m "chore: 后端工程脚手架与 Hono 健康检查"
```

---

## Task 2: 共享类型定义

**Files:**
- Create: `shared/types.ts`

**Interfaces:**
- Consumes: 无。
- Produces: 前后端共用类型:`MemberKind`、`Member`、`MessageStatus`、`Message`、`Mention`、`SseEvent`(5 种事件的可辨识联合)、`PostMessageBody`、`JoinBody`。

- [ ] **Step 1: 写类型文件**

`shared/types.ts`:

```ts
export type MemberKind = 'human' | 'ai'

export interface Member {
  id: string
  kind: MemberKind
  displayName: string
  avatar: string
  online: boolean
  createdAt: number
}

export type MessageStatus = 'streaming' | 'complete' | 'error'

export interface Message {
  id: string
  senderId: string
  content: string
  status: MessageStatus
  replyTo: string | null
  createdAt: number
  /** 被 @ 的成员 id 列表(从 mentions 表聚合而来) */
  mentions: string[]
}

/** POST /api/messages 的请求体 */
export interface PostMessageBody {
  senderId: string
  content: string
  /** 前端结构化选择的被 @ 成员 id 列表 */
  mentions: string[]
}

/** POST /api/members/join 的请求体 */
export interface JoinBody {
  displayName: string
}

/** SSE 事件(可辨识联合,type 为判别字段) */
export type SseEvent =
  | { type: 'presence'; members: Member[] }
  | { type: 'message:new'; message: Message }
  | { type: 'message:delta'; messageId: string; chunk: string }
  | { type: 'message:done'; messageId: string; content: string }
  | { type: 'message:error'; messageId: string; error: string }
```

- [ ] **Step 2: 类型编译校验**

Run: `pnpm exec tsc -p tsconfig.server.json --noEmit`
Expected: 无错误(types.ts 纯类型,应通过)。

- [ ] **Step 3: Commit**

```bash
git add shared/types.ts
git commit -m "feat: 前后端共享类型定义"
```

---

## Task 3: SQLite 存储层 — 连接与建表

**Files:**
- Create: `server/store/db.ts`
- Test: `server/store/db.test.ts`

**Interfaces:**
- Consumes: 无。
- Produces:
  - `createDb(path: string): Database` — 创建连接、执行建表 DDL、返回 better-sqlite3 实例。`path` 传 `':memory:'` 用于测试。
  - 默认导出 `db`(用文件 `data.sqlite`,供运行时使用)。
  - 三张表:`members(id PK, kind, display_name, avatar, online, created_at)`、`messages(id PK, sender_id, content, status, reply_to, created_at)`、`mentions(message_id, member_id)`。

- [ ] **Step 1: 写失败测试**

`server/store/db.test.ts`:

```ts
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm exec vitest run server/store/db.test.ts`
Expected: FAIL,提示 `createDb` 无法从 `./db.ts` 导入(模块不存在)。

- [ ] **Step 3: 实现 db.ts**

`server/store/db.ts`:

```ts
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
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm exec vitest run server/store/db.test.ts`
Expected: PASS,两个用例均通过。

- [ ] **Step 5: Commit**

```bash
git add server/store/db.ts server/store/db.test.ts
git commit -m "feat: SQLite 连接与建表"
```

---

## Task 4: 成员仓储

**Files:**
- Create: `server/store/members.ts`
- Test: `server/store/members.test.ts`

**Interfaces:**
- Consumes: `createDb` (Task 3),`Member`、`MemberKind` (Task 2)。
- Produces 一个 `createMemberRepo(db)` 工厂,返回对象含:
  - `upsert(m: { id: string; kind: MemberKind; displayName: string; avatar: string; online: boolean }): void`
  - `setOnline(id: string, online: boolean): void`
  - `get(id: string): Member | undefined`
  - `list(): Member[]`(按 created_at 升序)
  - `listAi(): Member[]`(仅 kind='ai')

> 工厂接收 db 注入,便于测试用内存库;运行时在 Task 12 用默认 `db` 实例化。

- [ ] **Step 1: 写失败测试**

`server/store/members.test.ts`:

```ts
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm exec vitest run server/store/members.test.ts`
Expected: FAIL，`createMemberRepo` 无法导入。

- [ ] **Step 3: 实现 members.ts**

`server/store/members.ts`:

```ts
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
```

> 注:`upsert` 的 `created_at` 在冲突更新时不覆盖(只在插入时写),保持首次创建时间。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm exec vitest run server/store/members.test.ts`
Expected: PASS，4 个用例全过。

- [ ] **Step 5: Commit**

```bash
git add server/store/members.ts server/store/members.test.ts
git commit -m "feat: 成员仓储"
```

---

## Task 5: 消息仓储

**Files:**
- Create: `server/store/messages.ts`
- Test: `server/store/messages.test.ts`

**Interfaces:**
- Consumes: `createDb` (Task 3),`Message`、`MessageStatus` (Task 2),`CONTEXT_WINDOW` (Task 1)。
- Produces `createMessageRepo(db)` 工厂,返回:
  - `insert(m: { id: string; senderId: string; content: string; status: MessageStatus; replyTo?: string | null; mentions?: string[] }): Message`
  - `appendContent(id: string, chunk: string): void`(流式增量累加到 content)
  - `setStatus(id: string, status: MessageStatus): void`
  - `finalize(id: string, content: string): void`(写完整内容并置 complete)
  - `recent(limit: number): Message[]`(按 created_at 升序的最近 limit 条,含 mentions)
  - `get(id: string): Message | undefined`

- [ ] **Step 1: 写失败测试**

`server/store/messages.test.ts`:

```ts
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm exec vitest run server/store/messages.test.ts`
Expected: FAIL，`createMessageRepo` 无法导入。

- [ ] **Step 3: 实现 messages.ts**

`server/store/messages.ts`:

```ts
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
```

> 注:`recent` 用 `DESC LIMIT` 取最新 N 条再 `reverse()`,保证返回是时间升序。多条消息在同一毫秒插入时 `created_at` 可能相同;测试中循环插入通常跨毫秒,若出现偶发乱序,实现时可加自增列兜底——但当前先以 created_at 为准。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm exec vitest run server/store/messages.test.ts`
Expected: PASS，5 个用例全过。若 `recent` 用例因同毫秒插入偶发失败,改 db.ts 给 messages 加 `seq INTEGER PRIMARY KEY AUTOINCREMENT` 并按 seq 排序(此为兜底,非默认)。

- [ ] **Step 5: Commit**

```bash
git add server/store/messages.ts server/store/messages.test.ts
git commit -m "feat: 消息仓储"
```

---

## Task 6: 触发规则纯函数(@ 解析核心)

**Files:**
- Create: `server/chat/mentions.ts`
- Test: `server/chat/mentions.test.ts`

**Interfaces:**
- Consumes: `Member` (Task 2)。
- Produces:
  - `resolveTriggeredAis(mentions: string[], aiMembers: Member[]): string[]` — 给定被 @ 的 member_id 列表和全部 AI 成员,返回应触发回复的 AI id 列表。
  - 规则:`mentions` 为空 → 返回所有 AI id;`mentions` 含 AI → 返回其中是 AI 的那些;`mentions` 只含真人(无 AI) → 返回空数组。
- 重要:本函数**只看传入的 mentions 数组**,不解析任何文本,从根上杜绝 AI 互相 @。

- [ ] **Step 1: 写失败测试**

`server/chat/mentions.test.ts`:

```ts
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm exec vitest run server/chat/mentions.test.ts`
Expected: FAIL，`resolveTriggeredAis` 无法导入。

- [ ] **Step 3: 实现 mentions.ts**

`server/chat/mentions.ts`:

```ts
import type { Member } from '../../shared/types.ts'

/**
 * 根据被 @ 的成员 id 列表决定哪些 AI 应该回复。
 * - 不解析任何文本,只看传入的 mentions 数组(硬规则:杜绝 AI 互相 @ 死循环)。
 * - mentions 为空 → 所有 AI 都触发。
 * - mentions 含 AI → 仅触发其中的 AI。
 * - mentions 只含真人/无效 id → 不触发任何 AI。
 */
export function resolveTriggeredAis(mentions: string[], aiMembers: Member[]): string[] {
  const aiIds = new Set(aiMembers.map((m) => m.id))
  if (mentions.length === 0) {
    return [...aiIds]
  }
  return mentions.filter((id) => aiIds.has(id))
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm exec vitest run server/chat/mentions.test.ts`
Expected: PASS，6 个用例全过。

- [ ] **Step 5: Commit**

```bash
git add server/chat/mentions.ts server/chat/mentions.test.ts
git commit -m "feat: @ 触发规则纯函数"
```

---

## Task 7: Mastra agent 构建与 generateReply

**Files:**
- Create: `server/config/model.config.ts`
- Create: `server/config/agents.config.ts`
- Create: `server/chat/context.ts`
- Test: `server/chat/context.test.ts`
- Create: `server/agents/mastra.ts`

**Interfaces:**
- Consumes: `Message`、`Member` (Task 2),`CONTEXT_WINDOW` (Task 1)。
- Produces:
  - `AI_PERSONAS: Persona[]`,`Persona = { id; displayName; avatar; instructions }`。
  - `MODEL_CONFIG`(读 env)。
  - `buildContext(messages: Message[], members: Member[], selfId: string): { role: 'user' | 'assistant'; content: string }[]` — 把群历史转成 Mastra 消息数组,他人发言标注 `显示名: 内容` 作为 user,自己历史发言作为 assistant。
  - `mastra`(Mastra 实例)、`getAgent(id)`。
  - `generateReply(agentId, context, onDelta): Promise<string>` — 调 `agent.stream`,每个增量回调 `onDelta(chunk)`,返回完整文本;失败抛错。

- [ ] **Step 1: 装包后用 embedded docs 核实 Mastra 流式 API(必做,有据可依)**

Run:
```bash
grep -rl "textStream\|streamVNext\|streamLegacy" node_modules/@mastra/core/dist/docs/ | head
grep -rn "\.stream(" node_modules/@mastra/core/dist/docs/reference* 2>/dev/null | head
```
核对要点:`agent.stream(messages)` 返回对象是否有 `textStream` 异步迭代器;若该 Mastra 版本要求 `.streamVNext()` 或 `.streamLegacy()`,记下正确方法名,Step 5 实现按此修正。同时确认 `Agent` 构造参数(`id/name/instructions/model`)与 `model` 字符串格式。

- [ ] **Step 2: 模型配置**

`server/config/model.config.ts`:

```ts
export const MODEL_CONFIG = {
  // 'openai/<model>' 形式;具体模型名用 OPENAI_MODEL 注入,默认值占位,装包后用 provider registry 核实
  model: `openai/${process.env.OPENAI_MODEL ?? 'gpt-4o-mini'}`,
  apiKey: process.env.OPENAI_API_KEY ?? '',
  baseURL: process.env.OPENAI_BASE_URL || undefined,
}

export function assertModelConfig(): void {
  if (!MODEL_CONFIG.apiKey) {
    throw new Error('[config] 缺少 OPENAI_API_KEY,请在 .env 中配置')
  }
}
```

- [ ] **Step 3: 人设配置**

`server/config/agents.config.ts`:

```ts
export interface Persona {
  id: string
  displayName: string
  avatar: string
  instructions: string
}

export const AI_PERSONAS: Persona[] = [
  { id: 'ai_pm', displayName: '产品经理', avatar: '📋',
    instructions: '你是一位资深产品经理,关注用户价值、可行性和优先级。回复简洁、给出可执行建议。你正在一个多人群聊里,消息会标注发言人。' },
  { id: 'ai_critic', displayName: '毒舌评论家', avatar: '🔥',
    instructions: '你是一位犀利的评论家,擅长挑出方案的漏洞和风险。直言不讳但对事不对人。你正在一个多人群聊里,消息会标注发言人。' },
  { id: 'ai_helper', displayName: '万能助手', avatar: '🤖',
    instructions: '你是一位友好的通用助手,有问必答,回复亲切清晰。你正在一个多人群聊里,消息会标注发言人。' },
]
```

- [ ] **Step 4: 写 buildContext 失败测试**

`server/chat/context.test.ts`:

```ts
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
```

- [ ] **Step 5: 实现 context.ts**

`server/chat/context.ts`:

```ts
import type { Message, Member } from '../../shared/types.ts'

export function buildContext(
  messages: Message[],
  members: Member[],
  selfId: string,
): { role: 'user' | 'assistant'; content: string }[] {
  const nameOf = new Map(members.map((m) => [m.id, m.displayName]))
  const out: { role: 'user' | 'assistant'; content: string }[] = []
  for (const m of messages) {
    if (m.content === '') continue // 跳过流式占位空消息
    if (m.senderId === selfId) {
      out.push({ role: 'assistant', content: m.content })
    } else {
      const name = nameOf.get(m.senderId) ?? m.senderId
      out.push({ role: 'user', content: `${name}: ${m.content}` })
    }
  }
  return out
}
```

- [ ] **Step 6: 运行 context 测试确认通过**

Run: `pnpm exec vitest run server/chat/context.test.ts`
Expected: PASS，3 个用例全过。

- [ ] **Step 7: 实现 mastra.ts(按 Step 1 核实的 API 写流式)**

`server/agents/mastra.ts`(以下基于官方远程文档的 `agent.stream` + `textStream`;若 Step 1 显示本版本方法名不同,替换 `agent.stream`/`textStream` 为核实到的名字):

```ts
import { Mastra } from '@mastra/core'
import { Agent } from '@mastra/core/agent'
import { AI_PERSONAS } from '../config/agents.config.ts'
import { MODEL_CONFIG } from '../config/model.config.ts'

const agents = Object.fromEntries(
  AI_PERSONAS.map((p) => [
    p.id,
    new Agent({ id: p.id, name: p.displayName, instructions: p.instructions, model: MODEL_CONFIG.model }),
  ]),
)

export const mastra = new Mastra({ agents })

export function getAgent(id: string): Agent {
  const a = mastra.getAgent(id)
  if (!a) throw new Error(`[mastra] 未找到 agent: ${id}`)
  return a
}

/** 单次带上下文的流式生成。每个增量回调 onDelta;返回完整文本。 */
export async function generateReply(
  agentId: string,
  context: { role: 'user' | 'assistant'; content: string }[],
  onDelta: (chunk: string) => void,
): Promise<string> {
  const agent = getAgent(agentId)
  const stream = await agent.stream(context)
  let full = ''
  for await (const chunk of stream.textStream) {
    full += chunk
    onDelta(chunk)
  }
  return full
}
```

> Mastra 层只做"上下文 → 流式文本",不碰 SSE、不碰 DB、不懂 @ 规则。Mastra 自带 Memory 不启用——群历史由我们的 messages 表提供。

- [ ] **Step 8: 编译校验(不真调 OpenAI)**

Run: `pnpm exec tsc -p tsconfig.server.json --noEmit`
Expected: 无类型错误。若报 `agent.stream`/`textStream` 不存在,说明本版本 API 名不同,按 Step 1 的 embedded docs 结果修正后重跑。

- [ ] **Step 9: Commit**

```bash
git add server/config/model.config.ts server/config/agents.config.ts server/chat/context.ts server/chat/context.test.ts server/agents/mastra.ts
git commit -m "feat: Mastra agent 构建、上下文组装与 generateReply"
```

---

## Task 8: 广播中心(BroadcastHub)

**Files:**
- Create: `server/chat/broadcast.ts`
- Test: `server/chat/broadcast.test.ts`

**Interfaces:**
- Consumes: `SseEvent` (Task 2)。
- Produces `createBroadcastHub()`,返回:
  - `subscribe(send: (event: SseEvent) => void): () => void` — 注册一个推送函数,返回取消订阅函数。
  - `broadcast(event: SseEvent): void` — 向所有订阅者推送。
  - `count(): number` — 当前订阅者数量。
- 这是"所有人都能收到"的唯一出口。SSE 路由在连接建立时 subscribe,断开时调用返回的取消函数。

- [ ] **Step 1: 写失败测试**

`server/chat/broadcast.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { createBroadcastHub } from './broadcast.ts'
import type { SseEvent } from '../../shared/types.ts'

const ev: SseEvent = { type: 'message:delta', messageId: 'm1', chunk: 'x' }

describe('broadcastHub', () => {
  it('broadcast 推给所有订阅者', () => {
    const hub = createBroadcastHub()
    const a = vi.fn(); const b = vi.fn()
    hub.subscribe(a); hub.subscribe(b)
    hub.broadcast(ev)
    expect(a).toHaveBeenCalledWith(ev)
    expect(b).toHaveBeenCalledWith(ev)
  })

  it('取消订阅后不再收到', () => {
    const hub = createBroadcastHub()
    const a = vi.fn()
    const unsub = hub.subscribe(a)
    unsub()
    hub.broadcast(ev)
    expect(a).not.toHaveBeenCalled()
    expect(hub.count()).toBe(0)
  })

  it('count 反映订阅者数量', () => {
    const hub = createBroadcastHub()
    hub.subscribe(vi.fn()); hub.subscribe(vi.fn())
    expect(hub.count()).toBe(2)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm exec vitest run server/chat/broadcast.test.ts`
Expected: FAIL，`createBroadcastHub` 无法导入。

- [ ] **Step 3: 实现 broadcast.ts**

`server/chat/broadcast.ts`:

```ts
import type { SseEvent } from '../../shared/types.ts'

type Send = (event: SseEvent) => void

export function createBroadcastHub() {
  const subscribers = new Set<Send>()
  return {
    subscribe(send: Send): () => void {
      subscribers.add(send)
      return () => subscribers.delete(send)
    },
    broadcast(event: SseEvent): void {
      for (const send of subscribers) {
        try {
          send(event)
        } catch {
          // 单个连接推送失败不应影响其他连接;断开会由 SSE 路由清理
        }
      }
    },
    count(): number {
      return subscribers.size
    },
  }
}

export type BroadcastHub = ReturnType<typeof createBroadcastHub>
export const hub = createBroadcastHub()
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm exec vitest run server/chat/broadcast.test.ts`
Expected: PASS，3 个用例全过。

- [ ] **Step 5: Commit**

```bash
git add server/chat/broadcast.ts server/chat/broadcast.test.ts
git commit -m "feat: 广播中心"
```

---

## Task 9: 编排器(orchestrator)

**Files:**
- Create: `server/chat/orchestrator.ts`
- Test: `server/chat/orchestrator.test.ts`

**Interfaces:**
- Consumes: `MessageRepo` (Task 5)、`MemberRepo` (Task 4)、`resolveTriggeredAis` (Task 6)、`buildContext` (Task 7)、`BroadcastHub` (Task 8)、`CONTEXT_WINDOW` (Task 1)、`Message` (Task 2)。
- Produces `createOrchestrator(deps)`,`deps = { messages, members, hub, generateReply, genId }`,返回:
  - `handleHumanMessage(body: PostMessageBody): Message` — 写入真人消息、广播 `message:new`、按规则触发 AI(异步,不阻塞返回)。返回已落库的真人消息。
  - 内部 `runAi(aiId, replyTo)` — 插占位 streaming 消息并广播 → 调 `generateReply`(增量 `appendContent`+广播 delta)→ `finalize`+广播 done;失败 `setStatus('error')`+广播 error。
- `generateReply` 与 `genId` 作为依赖注入,测试时用假实现(不调真 OpenAI)。

- [ ] **Step 1: 写失败测试(注入假 generateReply)**

`server/chat/orchestrator.test.ts`:

```ts
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
```

> 注:第三个用例的重点是验证 `generateReply` 抛错时编排器走 error 分支。无 @ 时所有 AI 触发,这里只有 ai_pm 一个 AI。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm exec vitest run server/chat/orchestrator.test.ts`
Expected: FAIL，`createOrchestrator` 无法导入。

- [ ] **Step 3: 实现 orchestrator.ts**

`server/chat/orchestrator.ts`:

```ts
import type { MessageRepo } from '../store/messages.ts'
import type { MemberRepo } from '../store/members.ts'
import type { BroadcastHub } from './broadcast.ts'
import type { Message, PostMessageBody } from '../../shared/types.ts'
import { CONTEXT_WINDOW } from '../config/constants.ts'
import { resolveTriggeredAis } from './mentions.ts'
import { buildContext } from './context.ts'

interface Deps {
  messages: MessageRepo
  members: MemberRepo
  hub: BroadcastHub
  genId: () => string
  generateReply: (
    agentId: string,
    context: { role: 'user' | 'assistant'; content: string }[],
    onDelta: (chunk: string) => void,
  ) => Promise<string>
}

export function createOrchestrator(deps: Deps) {
  const { messages, members, hub, genId, generateReply } = deps

  async function runAi(aiId: string, replyTo: string): Promise<void> {
    const id = genId()
    messages.insert({ id, senderId: aiId, content: '', status: 'streaming', replyTo })
    hub.broadcast({ type: 'message:new', message: messages.get(id)! })
    try {
      const ctx = buildContext(messages.recent(CONTEXT_WINDOW), members.list(), aiId)
      const full = await generateReply(aiId, ctx, (chunk) => {
        messages.appendContent(id, chunk)
        hub.broadcast({ type: 'message:delta', messageId: id, chunk })
      })
      messages.finalize(id, full)
      hub.broadcast({ type: 'message:done', messageId: id, content: full })
    } catch (err) {
      messages.setStatus(id, 'error')
      hub.broadcast({
        type: 'message:error',
        messageId: id,
        error: err instanceof Error ? err.message : '生成失败',
      })
    }
  }

  function handleHumanMessage(body: PostMessageBody): Message {
    const id = genId()
    const message = messages.insert({
      id, senderId: body.senderId, content: body.content,
      status: 'complete', mentions: body.mentions,
    })
    hub.broadcast({ type: 'message:new', message })

    const triggered = resolveTriggeredAis(body.mentions, members.listAi())
    // 并行触发,不阻塞 HTTP 返回
    for (const aiId of triggered) void runAi(aiId, id)
    return message
  }

  return { handleHumanMessage, runAi }
}

export type Orchestrator = ReturnType<typeof createOrchestrator>
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm exec vitest run server/chat/orchestrator.test.ts`
Expected: PASS，3 个用例全过。

- [ ] **Step 5: Commit**

```bash
git add server/chat/orchestrator.ts server/chat/orchestrator.test.ts
git commit -m "feat: 群聊编排器"
```

---

## Task 10: 运行时装配 + SSE 路由

**Files:**
- Create: `server/runtime.ts`
- Create: `server/routes/stream.ts`
- Modify: `server/index.ts`(挂载 stream 路由 + 启动时初始化 AI 成员)

**Interfaces:**
- Consumes: `db`、`hub`(Task 3/8 的默认单例)、各仓储工厂、`createOrchestrator` (Task 9)、`generateReply` (Task 7)、`AI_PERSONAS` (Task 7)、`assertModelConfig` (Task 7)、`SseEvent` (Task 2)。
- Produces:
  - `server/runtime.ts`:用默认 `db`/`hub` 装配出 `memberRepo`、`messageRepo`、`orchestrator`,导出供路由共用;并导出 `initAiMembers()` 把 `AI_PERSONAS` upsert 进 members 表。
  - `GET /api/stream`:SSE 端点,连接时 subscribe 到 hub,先推送一次 `presence`,断开时取消订阅。

- [ ] **Step 1: 运行时装配**

`server/runtime.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { db } from './store/db.ts'
import { hub } from './chat/broadcast.ts'
import { createMemberRepo } from './store/members.ts'
import { createMessageRepo } from './store/messages.ts'
import { createOrchestrator } from './chat/orchestrator.ts'
import { generateReply } from './agents/mastra.ts'
import { AI_PERSONAS } from './config/agents.config.ts'

export const memberRepo = createMemberRepo(db)
export const messageRepo = createMessageRepo(db)
export const orchestrator = createOrchestrator({
  messages: messageRepo,
  members: memberRepo,
  hub,
  genId: () => randomUUID(),
  generateReply,
})

export function initAiMembers(): void {
  for (const p of AI_PERSONAS) {
    memberRepo.upsert({ id: p.id, kind: 'ai', displayName: p.displayName, avatar: p.avatar, online: true })
  }
}
```

- [ ] **Step 2: SSE 路由(基于已核实的 Hono streamSSE API)**

`server/routes/stream.ts`:

```ts
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { hub } from '../chat/broadcast.ts'
import { memberRepo } from '../runtime.ts'
import type { SseEvent } from '../../shared/types.ts'

export const streamRoute = new Hono()

streamRoute.get('/api/stream', (c) => {
  return streamSSE(c, async (stream) => {
    // 连接建立:先推送当前在线成员
    await stream.writeSSE({
      event: 'presence',
      data: JSON.stringify({ type: 'presence', members: memberRepo.list() } satisfies SseEvent),
    })

    // 订阅广播:把事件写进这条 SSE
    const queue: SseEvent[] = []
    let notify: (() => void) | null = null
    const unsubscribe = hub.subscribe((ev) => {
      queue.push(ev)
      notify?.()
    })

    c.req.raw.signal.addEventListener('abort', () => {
      unsubscribe()
      notify?.()
    })

    try {
      while (!stream.aborted) {
        while (queue.length > 0) {
          const ev = queue.shift()!
          await stream.writeSSE({ event: ev.type, data: JSON.stringify(ev) })
        }
        // 等待下一个事件或中断
        await new Promise<void>((resolve) => { notify = resolve })
        notify = null
      }
    } finally {
      unsubscribe()
    }
  })
})
```

> SSE 事件用 `event: ev.type`(如 `message:delta`),`data` 为完整 JSON。前端可监听具体事件名,也可统一解析 data 里的 `type`。队列 + notify 模式避免丢事件:订阅回调只入队并唤醒写循环,真正写入在循环里串行完成。

- [ ] **Step 3: index.ts 挂载并初始化**

修改 `server/index.ts` 为:

```ts
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { PORT } from './config/constants.ts'
import { assertModelConfig } from './config/model.config.ts'
import { initAiMembers } from './runtime.ts'
import { streamRoute } from './routes/stream.ts'

assertModelConfig()
initAiMembers()

const app = new Hono()
app.get('/api/health', (c) => c.json({ ok: true }))
app.route('/', streamRoute)

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[server] listening on http://localhost:${info.port}`)
})

export { app }
```

- [ ] **Step 4: 手动验证 SSE 连接**

先确保 `.env` 里有 `OPENAI_API_KEY`(随便填一个非空值即可通过 `assertModelConfig`,本步不调模型)。
Run: `pnpm dev:server`,另开终端 `curl -N http://localhost:3001/api/stream`
Expected: curl 收到一条 `event: presence` 的数据,内含 3 个 AI 成员;连接保持打开。Ctrl-C 断开。

- [ ] **Step 5: Commit**

```bash
git add server/runtime.ts server/routes/stream.ts server/index.ts
git commit -m "feat: 运行时装配与 SSE 端点"
```

---

## Task 11: 消息与成员 HTTP 路由

**Files:**
- Create: `server/routes/members.ts`
- Create: `server/routes/messages.ts`
- Modify: `server/index.ts`(挂载这两个路由)

**Interfaces:**
- Consumes: `memberRepo`、`messageRepo`、`orchestrator`、`hub` (Task 10/8),`MAX_MESSAGE_LENGTH`、`CONTEXT_WINDOW` (Task 1),`PostMessageBody`、`JoinBody`、`SseEvent` (Task 2)。
- Produces:
  - `POST /api/members/join`(body `JoinBody`)→ 创建真人成员(id 用 `human_<uuid>`,online=true)、广播 `presence`,返回该 `Member`。
  - `GET /api/members` → 返回全部成员。
  - `POST /api/messages`(body `PostMessageBody`)→ 校验后交编排器处理,返回真人消息。空内容/超长返回 400。
  - `GET /api/messages?limit=50` → 返回最近 N 条(供前端重连补齐)。

- [ ] **Step 1: 写路由集成测试(用 app.request,不起真实端口)**

`server/routes/routes.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

// 注:本测试依赖 runtime 单例;为隔离,设置内存 DB
process.env.DB_PATH = ':memory:'
process.env.OPENAI_API_KEY = 'test-key'

const { app } = await import('../index.ts')

describe('HTTP 路由', () => {
  it('join 创建真人成员', async () => {
    const res = await app.request('/api/members/join', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: '小明' }),
    })
    expect(res.status).toBe(200)
    const m = await res.json()
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
    const msg = await res.json()
    expect(msg.content).toBe('大家好')
  })

  it('GET /api/messages 返回数组', async () => {
    const res = await app.request('/api/messages?limit=10')
    expect(res.status).toBe(200)
    expect(Array.isArray(await res.json())).toBe(true)
  })
})
```

> 注:此处用 `mentions: ['human_only']` 避免触发真实 AI 调用(@ 的是不存在的真人,resolveTriggeredAis 返回空)。这样路由测试不依赖 OpenAI。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm exec vitest run server/routes/routes.test.ts`
Expected: FAIL，路由未挂载(404)或导入失败。

- [ ] **Step 3: 实现 members 路由**

`server/routes/members.ts`:

```ts
import { Hono } from 'hono'
import { randomUUID } from 'node:crypto'
import { memberRepo } from '../runtime.ts'
import { hub } from '../chat/broadcast.ts'
import type { JoinBody, SseEvent } from '../../shared/types.ts'

export const membersRoute = new Hono()

membersRoute.post('/api/members/join', async (c) => {
  const body = (await c.req.json()) as JoinBody
  const displayName = (body.displayName ?? '').trim()
  if (!displayName) return c.json({ error: '昵称不能为空' }, 400)
  const id = `human_${randomUUID()}`
  memberRepo.upsert({ id, kind: 'human', displayName, avatar: '', online: true })
  hub.broadcast({ type: 'presence', members: memberRepo.list() } satisfies SseEvent)
  return c.json(memberRepo.get(id))
})

membersRoute.get('/api/members', (c) => c.json(memberRepo.list()))
```

- [ ] **Step 4: 实现 messages 路由**

`server/routes/messages.ts`:

```ts
import { Hono } from 'hono'
import { messageRepo, orchestrator } from '../runtime.ts'
import { MAX_MESSAGE_LENGTH, CONTEXT_WINDOW } from '../config/constants.ts'
import type { PostMessageBody } from '../../shared/types.ts'

export const messagesRoute = new Hono()

messagesRoute.post('/api/messages', async (c) => {
  const body = (await c.req.json()) as PostMessageBody
  const content = (body.content ?? '').trim()
  if (!content) return c.json({ error: '消息不能为空' }, 400)
  if (content.length > MAX_MESSAGE_LENGTH) return c.json({ error: '消息过长' }, 400)
  const message = orchestrator.handleHumanMessage({
    senderId: body.senderId,
    content,
    mentions: body.mentions ?? [],
  })
  return c.json(message)
})

messagesRoute.get('/api/messages', (c) => {
  const limit = Number(c.req.query('limit') ?? CONTEXT_WINDOW)
  return c.json(messageRepo.recent(limit))
})
```

- [ ] **Step 5: index.ts 挂载两个路由**

在 `server/index.ts` 中,`app.route('/', streamRoute)` 之后追加:

```ts
import { membersRoute } from './routes/members.ts'
import { messagesRoute } from './routes/messages.ts'
// ...
app.route('/', membersRoute)
app.route('/', messagesRoute)
```

- [ ] **Step 6: 运行测试确认通过**

Run: `pnpm exec vitest run server/routes/routes.test.ts`
Expected: PASS，4 个用例全过。

- [ ] **Step 7: Commit**

```bash
git add server/routes/members.ts server/routes/messages.ts server/routes/routes.test.ts server/index.ts
git commit -m "feat: 消息与成员 HTTP 路由"
```

---

## Task 12: 前端 API 封装与 SSE hook

**Files:**
- Create: `src/api/client.ts`
- Create: `src/hooks/useChatStream.ts`

**Interfaces:**
- Consumes: `Member`、`Message`、`SseEvent`、`PostMessageBody`、`JoinBody` (Task 2)。
- Produces:
  - `client`:`join(displayName)`、`fetchMessages(limit)`、`fetchMembers()`、`postMessage(body)`。
  - `useChatStream(): { messages: Message[]; members: Member[]; connected: boolean }` — 建立 SSE、应用 5 种事件、维护消息列表与成员列表;重连后用 `fetchMessages` 补齐。

- [ ] **Step 1: 实现 API client**

`src/api/client.ts`:

```ts
import type { Member, Message, PostMessageBody, JoinBody } from '../../shared/types.ts'

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`)
  return res.json() as Promise<T>
}

export const client = {
  join: (displayName: string) =>
    fetch('/api/members/join', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName } satisfies JoinBody),
    }).then((r) => json<Member>(r)),
  fetchMessages: (limit = 50) =>
    fetch(`/api/messages?limit=${limit}`).then((r) => json<Message[]>(r)),
  fetchMembers: () => fetch('/api/members').then((r) => json<Member[]>(r)),
  postMessage: (body: PostMessageBody) =>
    fetch('/api/messages', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => json<Message>(r)),
}
```

- [ ] **Step 2: 实现 useChatStream hook**

`src/hooks/useChatStream.ts`:

```ts
import { useEffect, useRef, useState } from 'react'
import type { Member, Message, SseEvent } from '../../shared/types.ts'
import { client } from '../api/client.ts'

export function useChatStream() {
  const [messages, setMessages] = useState<Message[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [connected, setConnected] = useState(false)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    // 初次加载历史
    client.fetchMessages(50).then(setMessages).catch(() => {})

    const es = new EventSource('/api/stream')
    esRef.current = es

    es.onopen = () => {
      setConnected(true)
      // 重连后补齐可能漏掉的历史
      client.fetchMessages(50).then(setMessages).catch(() => {})
    }
    es.onerror = () => setConnected(false)

    es.onmessage = (e) => apply(JSON.parse(e.data) as SseEvent)
    // 后端为每个事件设置了 event: 字段,这里统一监听 data 中的 type
    for (const type of ['presence', 'message:new', 'message:delta', 'message:done', 'message:error']) {
      es.addEventListener(type, (e) => apply(JSON.parse((e as MessageEvent).data) as SseEvent))
    }

    function apply(ev: SseEvent) {
      if (ev.type === 'presence') { setMembers(ev.members); return }
      if (ev.type === 'message:new') {
        setMessages((prev) => prev.some((m) => m.id === ev.message.id) ? prev : [...prev, ev.message])
        return
      }
      if (ev.type === 'message:delta') {
        setMessages((prev) => prev.map((m) =>
          m.id === ev.messageId ? { ...m, content: m.content + ev.chunk } : m))
        return
      }
      if (ev.type === 'message:done') {
        setMessages((prev) => prev.map((m) =>
          m.id === ev.messageId ? { ...m, content: ev.content, status: 'complete' } : m))
        return
      }
      if (ev.type === 'message:error') {
        setMessages((prev) => prev.map((m) =>
          m.id === ev.messageId ? { ...m, status: 'error' } : m))
        return
      }
    }

    return () => es.close()
  }, [])

  return { messages, members, connected }
}
```

> 注:同时绑定了具名事件监听器和 `onmessage` 兜底。由于后端每条都带 `event:` 字段,具名监听器会命中;`onmessage` 仅在无 event 字段时触发,二者不会对同一事件重复 apply(浏览器按 event 字段择一分发)。`message:new` 做了去重防止本地乐观插入与广播重复。

- [ ] **Step 3: 编译校验**

Run: `pnpm exec tsc -p tsconfig.app.json --noEmit`
Expected: 无类型错误(注意前端 `verbatimModuleSyntax`,类型须 `import type`,上面已遵循)。

- [ ] **Step 4: Commit**

```bash
git add src/api/client.ts src/hooks/useChatStream.ts
git commit -m "feat: 前端 API 封装与 SSE 订阅 hook"
```

---

## Task 13: 前端聊天组件

**Files:**
- Create: `src/components/JoinDialog.tsx`
- Create: `src/components/MemberList.tsx`
- Create: `src/components/MessageList.tsx`
- Create: `src/components/Composer.tsx`

**Interfaces:**
- Consumes: `Member`、`Message` (Task 2)。
- Produces 四个受控组件:
  - `JoinDialog({ onJoin }: { onJoin: (displayName: string) => void })`
  - `MemberList({ members }: { members: Member[] })`
  - `MessageList({ messages, members, selfId }: { messages: Message[]; members: Member[]; selfId: string })`
  - `Composer({ members, onSend }: { members: Member[]; onSend: (content: string, mentions: string[]) => void })`

- [ ] **Step 1: JoinDialog**

`src/components/JoinDialog.tsx`:

```tsx
import { useState } from 'react'

export function JoinDialog({ onJoin }: { onJoin: (displayName: string) => void }) {
  const [name, setName] = useState('')
  return (
    <div className="join-dialog">
      <h2>进入群聊</h2>
      <input
        value={name}
        placeholder="起个昵称"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) onJoin(name.trim()) }}
      />
      <button disabled={!name.trim()} onClick={() => onJoin(name.trim())}>进入</button>
    </div>
  )
}
```

- [ ] **Step 2: MemberList**

`src/components/MemberList.tsx`:

```tsx
import type { Member } from '../../shared/types.ts'

export function MemberList({ members }: { members: Member[] }) {
  return (
    <aside className="member-list">
      <h3>成员 ({members.length})</h3>
      <ul>
        {members.map((m) => (
          <li key={m.id} className={m.kind === 'ai' ? 'ai' : 'human'}>
            <span className="avatar">{m.avatar || (m.kind === 'ai' ? '🤖' : '🙂')}</span>
            <span className="name">{m.displayName}</span>
            {m.kind === 'ai' && <span className="tag">AI</span>}
            {m.kind === 'human' && <span className={m.online ? 'dot on' : 'dot off'} />}
          </li>
        ))}
      </ul>
    </aside>
  )
}
```

- [ ] **Step 3: MessageList(含流式 / 错误态展示)**

`src/components/MessageList.tsx`:

```tsx
import { useEffect, useRef } from 'react'
import type { Member, Message } from '../../shared/types.ts'

export function MessageList({ messages, members, selfId }: {
  messages: Message[]; members: Member[]; selfId: string
}) {
  const nameOf = new Map(members.map((m) => [m.id, m]))
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  return (
    <div className="message-list">
      {messages.map((m) => {
        const sender = nameOf.get(m.senderId)
        const mine = m.senderId === selfId
        return (
          <div key={m.id} className={`msg ${mine ? 'mine' : ''} ${sender?.kind ?? ''}`}>
            <span className="avatar">{sender?.avatar || (sender?.kind === 'ai' ? '🤖' : '🙂')}</span>
            <div className="bubble">
              <div className="meta">{sender?.displayName ?? m.senderId}</div>
              <div className="content">
                {m.status === 'error'
                  ? <span className="error">⚠️ 生成失败</span>
                  : m.content || (m.status === 'streaming' ? '正在输入…' : '')}
                {m.status === 'streaming' && m.content && <span className="cursor">▋</span>}
              </div>
            </div>
          </div>
        )
      })}
      <div ref={endRef} />
    </div>
  )
}
```

- [ ] **Step 4: Composer(@ 结构化选择)**

`src/components/Composer.tsx`:

```tsx
import { useState } from 'react'
import type { Member } from '../../shared/types.ts'

export function Composer({ members, onSend }: {
  members: Member[]; onSend: (content: string, mentions: string[]) => void
}) {
  const [text, setText] = useState('')
  const [picked, setPicked] = useState<Member[]>([])
  const [showPicker, setShowPicker] = useState(false)

  function toggle(m: Member) {
    setPicked((prev) => prev.some((p) => p.id === m.id) ? prev.filter((p) => p.id !== m.id) : [...prev, m])
    setShowPicker(false)
  }
  function send() {
    const content = text.trim()
    if (!content) return
    const prefix = picked.map((m) => `@${m.displayName} `).join('')
    onSend(prefix + content, picked.map((m) => m.id))
    setText(''); setPicked([])
  }

  return (
    <div className="composer">
      {picked.length > 0 && (
        <div className="picked">{picked.map((m) => (
          <span key={m.id} className="chip" onClick={() => toggle(m)}>@{m.displayName} ✕</span>
        ))}</div>
      )}
      <div className="row">
        <button className="at" onClick={() => setShowPicker((s) => !s)}>@</button>
        <input
          value={text}
          placeholder="说点什么…(不 @ 任何人则所有 AI 都会回复)"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send() }}
        />
        <button onClick={send} disabled={!text.trim()}>发送</button>
      </div>
      {showPicker && (
        <ul className="picker">
          {members.map((m) => (
            <li key={m.id} onClick={() => toggle(m)}>
              {m.avatar || (m.kind === 'ai' ? '🤖' : '🙂')} {m.displayName}
              {m.kind === 'ai' && ' (AI)'}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 5: 编译校验**

Run: `pnpm exec tsc -p tsconfig.app.json --noEmit`
Expected: 无类型错误。

- [ ] **Step 6: Commit**

```bash
git add src/components/
git commit -m "feat: 前端聊天组件(加入/成员/消息/输入)"
```

---

## Task 14: App 主界面装配

**Files:**
- Modify: `src/App.tsx`(整体替换为聊天界面)
- Modify: `src/App.css`(替换为聊天布局样式)

**Interfaces:**
- Consumes: `useChatStream` (Task 12)、四个组件 (Task 13)、`client` (Task 12)、`Member` (Task 2)。
- Produces:聊天主界面——未加入显示 JoinDialog;加入后显示三栏(成员栏 + 消息列表 + 输入框),自身 id 存 localStorage。

- [ ] **Step 1: 替换 App.tsx**

`src/App.tsx`:

```tsx
import { useState } from 'react'
import './App.css'
import { useChatStream } from './hooks/useChatStream.ts'
import { client } from './api/client.ts'
import { JoinDialog } from './components/JoinDialog.tsx'
import { MemberList } from './components/MemberList.tsx'
import { MessageList } from './components/MessageList.tsx'
import { Composer } from './components/Composer.tsx'
import type { Member } from '../shared/types.ts'

function App() {
  const [self, setSelf] = useState<Member | null>(() => {
    const raw = localStorage.getItem('self')
    return raw ? (JSON.parse(raw) as Member) : null
  })
  const { messages, members, connected } = useChatStream()

  async function join(displayName: string) {
    const me = await client.join(displayName)
    localStorage.setItem('self', JSON.stringify(me))
    setSelf(me)
  }

  function send(content: string, mentions: string[]) {
    if (!self) return
    client.postMessage({ senderId: self.id, content, mentions }).catch((e) => alert(e.message))
  }

  if (!self) return <JoinDialog onJoin={join} />

  return (
    <div className="chat-app">
      <MemberList members={members} />
      <main className="chat-main">
        <header className="chat-header">
          AI 群聊 <span className={connected ? 'status on' : 'status off'}>
            {connected ? '● 已连接' : '○ 连接中…'}
          </span>
        </header>
        <MessageList messages={messages} members={members} selfId={self.id} />
        <Composer members={members} onSend={send} />
      </main>
    </div>
  )
}

export default App
```

- [ ] **Step 2: 替换 App.css(基础聊天布局)**

`src/App.css`:

```css
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; }
.join-dialog { max-width: 320px; margin: 20vh auto; display: flex; flex-direction: column; gap: 12px; }
.join-dialog input, .composer input { padding: 8px; font-size: 14px; }
.chat-app { display: flex; height: 100vh; }
.member-list { width: 200px; border-right: 1px solid #eee; padding: 12px; overflow-y: auto; }
.member-list ul { list-style: none; padding: 0; }
.member-list li { display: flex; align-items: center; gap: 6px; padding: 4px 0; }
.member-list .tag { font-size: 10px; background: #6c5ce7; color: #fff; border-radius: 4px; padding: 0 4px; }
.member-list .dot { width: 8px; height: 8px; border-radius: 50%; margin-left: auto; }
.member-list .dot.on { background: #22c55e; } .member-list .dot.off { background: #ccc; }
.chat-main { flex: 1; display: flex; flex-direction: column; }
.chat-header { padding: 12px 16px; border-bottom: 1px solid #eee; font-weight: 600; }
.chat-header .status { font-size: 12px; font-weight: 400; margin-left: 8px; }
.chat-header .status.on { color: #22c55e; } .chat-header .status.off { color: #f59e0b; }
.message-list { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.msg { display: flex; gap: 8px; max-width: 70%; }
.msg.mine { align-self: flex-end; flex-direction: row-reverse; }
.msg .bubble { background: #f1f1f4; border-radius: 10px; padding: 8px 12px; }
.msg.mine .bubble { background: #6c5ce7; color: #fff; }
.msg.ai .bubble { background: #eef6ff; }
.msg .meta { font-size: 11px; opacity: 0.6; margin-bottom: 2px; }
.msg .content .error { color: #ef4444; }
.cursor { animation: blink 1s steps(2) infinite; }
@keyframes blink { 0%,50% { opacity: 1; } 50.01%,100% { opacity: 0; } }
.composer { border-top: 1px solid #eee; padding: 12px; position: relative; }
.composer .row { display: flex; gap: 8px; }
.composer .row input { flex: 1; }
.composer .chip { background: #ede9fe; border-radius: 12px; padding: 2px 8px; margin-right: 6px; cursor: pointer; font-size: 12px; }
.composer .picker { position: absolute; bottom: 56px; left: 12px; background: #fff; border: 1px solid #eee; border-radius: 8px; list-style: none; padding: 4px; max-height: 200px; overflow-y: auto; }
.composer .picker li { padding: 6px 12px; cursor: pointer; } .composer .picker li:hover { background: #f5f5f5; }
```

- [ ] **Step 3: 编译校验**

Run: `pnpm exec tsc -p tsconfig.app.json --noEmit`
Expected: 无类型错误。

- [ ] **Step 4: 前端构建验证**

Run: `pnpm build`
Expected: tsc + vite build 成功,无错误。

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/App.css
git commit -m "feat: 聊天主界面装配"
```

---

## Task 15: 工程收尾与端到端冒烟

**Files:**
- Modify: `package.json`(并发启动脚本)
- Create: `vitest.config.ts`
- Modify: `README.md`(运行说明)

**Interfaces:**
- Consumes: 前面所有任务。
- Produces:`pnpm dev` 同时起前后端;`pnpm test` 跑全部单测;README 有启动与配置说明。

- [ ] **Step 1: 加并发启动依赖与脚本**

```bash
pnpm add -D concurrently
```

`package.json` scripts 调整(`dev` 改为并发起前后端):

```json
{
  "scripts": {
    "dev": "concurrently -n web,server -c blue,green \"vite\" \"tsx watch server/index.ts\"",
    "dev:web": "vite",
    "dev:server": "tsx watch server/index.ts",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 2: vitest 配置**

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/**/*.test.ts'],
  },
})
```

> 前端组件无自动化测试(本计划前端靠类型检查 + 手动冒烟);测试集中在后端逻辑。

- [ ] **Step 3: 跑全部后端单测**

Run: `pnpm test`
Expected: db / members / messages / mentions / context / broadcast / orchestrator / routes 全部 PASS。

- [ ] **Step 4: README 运行说明**

在 `README.md` 追加一节:

````markdown
## AI 群聊

### 配置

复制 `.env.example` 为 `.env`,填入:

```
OPENAI_API_KEY=你的key
OPENAI_BASE_URL=    # 可选,OpenAI 兼容厂商填其 baseURL
OPENAI_MODEL=       # 可选,默认 gpt-4o-mini
```

### 启动

```bash
pnpm install
pnpm dev        # 同时起前端(5173)与后端(3001)
```

打开 http://localhost:5173,起昵称进群。

- 不 @ 任何人 → 所有 AI 回复
- @某个/某些 AI → 只有被 @ 的 AI 回复
- @某个真人 → 仅提醒,AI 不回复

AI 角色在 `server/config/agents.config.ts` 中配置,可增删改。
````

- [ ] **Step 5: 端到端冒烟(手动,需真实 API Key)**

1. 配好 `.env` 真实 key,`pnpm dev`。
2. 浏览器开两个标签页(模拟两个真人),各起昵称进群。
3. A 发"大家好"(不 @)→ 验证:B 实时看到;3 个 AI 各自冒出"正在输入…"并打字机式逐字回复。
4. A 发"@产品经理 帮我评估"→ 验证:只有产品经理回复,另两个 AI 沉默。
5. A 发"@<B的昵称> 在吗"→ 验证:B 收到该消息(可高亮),AI 全部沉默。
6. 刷新页面 → 验证:历史消息仍在(持久化)。
7. 杀掉后端再重启 → 刷新前端 → 验证:历史仍在(SQLite 落盘)。

Expected: 以上全部符合预期。若 AI 不回复,检查 `.env` key、控制台 Mastra 报错,并按 Task 7 Step 1 复核流式 API 名。

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts README.md
git commit -m "chore: 并发启动脚本、vitest 配置与运行文档"
```

---

## 自检结论(Self-Review)

**1. Spec 覆盖**:
- 实时广播 → Task 8(hub)+ Task 10(SSE);@ 规则 → Task 6 + Task 9;AI 流式 → Task 7 + Task 9;持久化 → Task 3/4/5;人设可配 → Task 7;免登录进群 → Task 11;打字机前端 → Task 12/13;错误处理 → Task 9(error 分支)+ Task 12(error 渲染);断线重连补齐 → Task 12;测试策略 → 各任务 TDD + Task 15。spec 各节均有对应任务。
- 非目标(多群/鉴权/撤回/AI 互聊)未出现在任何任务中,符合 YAGNI。

**2. 占位符扫描**:无 TBD/TODO;唯一"占位"是模型名 `gpt-4o-mini` 默认值,已在 Global Constraints 与 Task 7 Step 1 明确要求装包后用 embedded docs / provider registry 核实,属有意注记而非遗漏。

**3. 类型一致性**:`SseEvent` 五分支在 Task 2 定义,Task 8/9/10/12 一致使用;仓储工厂 `createMemberRepo/createMessageRepo` 返回类型经 `MemberRepo/MessageRepo` 导出,Task 9 注入一致;`generateReply` 签名(agentId, context, onDelta)在 Task 7 定义,Task 9/10 一致引用;`resolveTriggeredAis(mentions, aiMembers)` 在 Task 6 定义,Task 9 一致调用。

**已知风险(实现时关注)**:Mastra `agent.stream()`/`textStream` 的确切方法名依赖装包版本,Task 7 Step 1 已设核实关卡;若版本差异较大,只影响 `server/agents/mastra.ts` 单文件,边界隔离良好。
