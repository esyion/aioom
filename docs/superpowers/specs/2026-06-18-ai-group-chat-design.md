# AI 群聊功能 · 设计文档

- **日期**: 2026-06-18
- **状态**: 已通过需求澄清与分节评审,待用户复审
- **作者**: brainstorming 协作产出

## 1. 目标与背景

实现一个**单一固定大群**的实时群聊,群内同时存在多个**真人**成员和多个 **AI** 成员。任何成员发送消息,群里所有人(含所有 AI)都能实时收到;AI 根据 @ 规则决定是否回复。AI 回复以**打字机流式**方式逐字呈现。

在现有 Vite + React 19 + TypeScript 模板基础上扩展,新增 Hono 后端,前后端同仓库。

### 成功标准

- 任意真人发消息,群内所有在线成员实时收到。
- 不 @ 任何人时,所有 AI 都回复;@ 指定 AI(可多个)时,仅被 @ 的 AI 回复;@ 真人时仅提醒该真人、AI 不回复。
- AI 回复逐字流式呈现(打字机效果)。
- 服务重启后历史消息与成员仍在,刷新页面可见聊天记录。
- 单个 AI 生成失败不影响其他 AI 与群聊整体可用性。

## 2. 需求结论(已与用户对齐)

| 维度 | 结论 |
|---|---|
| AI 来源 | 真实大模型,OpenAI(兼容层,可换 baseURL) |
| 后端编排 | Mastra(每个 AI = 一个 Agent) |
| 用户身份 | 免登录,起昵称即进 |
| 持久化 | SQLite(`better-sqlite3`) |
| 多 AI 协作 | 并行回复,各自拿完整群聊历史做上下文,互不等待 |
| @ 规则 | 不@→全部 AI 回;@AI(可多个)→被@的回;@真人→仅提醒 |
| 群结构 | 单一固定大群 |
| AI 呈现 | 打字机流式(增量推送) |
| AI 人设 | 预置 3 个独立角色,集中配置可改 |
| 实时通信 | SSE(接收)+ HTTP POST(发送) |

### @ 触发规则(权威表)

| 消息情况 | 谁来回复 |
|---|---|
| 不 @ 任何人 | 所有 AI 都回复 |
| @ 一个或多个 AI | 被 @ 的那些 AI 回复 |
| @ 真人 | 那个真人收到提醒,AI 不回复 |
| 同时 @ AI 和真人 | 被 @ 的 AI 回复,被 @ 的真人收到提醒 |

## 3. 整体架构

### 进程拓扑

单 Node 进程,内部分层:

```
浏览器 (React + Vite)
   │  ① POST /api/messages  发消息
   │  ② GET  /api/stream    SSE 长连接,接收一切
   ▼
Hono 服务器 (单进程)
   ├─ 路由层      HTTP 接口 + SSE 端点
   ├─ 群聊核心    广播中心 + @解析 + 触发规则
   ├─ Mastra 编排  每个 AI = 一个 Agent,负责调 OpenAI + 流式
   └─ 存储层      SQLite(消息、成员)
```

### 目录结构

```
template-react-ts/
├─ src/                      # 前端 React(改造成聊天界面)
│  ├─ components/            # MessageList / Composer / MemberList
│  ├─ hooks/                 # useChatStream(SSE) / useMessages
│  └─ api/                   # 前端调后端的封装
├─ server/                   # 后端(新增)
│  ├─ index.ts               # Hono 入口,启动 server
│  ├─ routes/                # /api/messages、/api/stream、/api/members
│  ├─ chat/                  # 广播中心、@解析、触发分发
│  ├─ agents/                # Mastra 实例 + AI 角色定义
│  ├─ store/                 # SQLite 封装(消息/成员仓储)
│  └─ config/                # AI 人设配置、模型配置
├─ shared/                   # 前后端共用 TS 类型(Message/Member/事件)
└─ package.json              # 前后端脚本合并
```

### 设计原则

- `shared/` 放前后端共用类型(消息结构、SSE 事件类型),保证端到端类型安全。
- 分层单一职责:路由层不碰业务;群聊核心不知道用哪家大模型;Mastra 层不知道传输是 SSE 还是 WS。换实时方案或换模型时改动隔离在单层内。
- 开发期用 Vite proxy 把 `/api` 转发到 Hono(默认 3001 端口),一条命令同时起前后端。

## 4. 数据模型与 SQLite 表结构

采用 `better-sqlite3`(同步 API,写入天然串行,无并发竞争)。

### `members` — 群成员(真人 + AI 同表,`kind` 区分)

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | TEXT PK | 成员唯一 ID(如 `human_xxx` / `ai_pm`) |
| `kind` | TEXT | `'human'` 或 `'ai'` |
| `display_name` | TEXT | 昵称/角色名,@ 时用它呈现 |
| `avatar` | TEXT | 头像(emoji 或 URL) |
| `online` | INTEGER | 真人是否在线(AI 恒为 1) |
| `created_at` | INTEGER | 时间戳 |

AI 成员在服务启动时从配置文件 upsert;真人成员在输入昵称进群时插入。

### `messages` — 群消息

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | TEXT PK | 消息 ID |
| `sender_id` | TEXT | 发送者成员 ID |
| `content` | TEXT | 文本内容 |
| `status` | TEXT | `'streaming'` / `'complete'` / `'error'` |
| `reply_to` | TEXT NULL | 可选,标记回复哪条触发消息 |
| `created_at` | INTEGER | 排序用 |

真人消息直接 `complete`;AI 流式时先建 `streaming`,完成后转 `complete`,失败转 `error`。

### `mentions` — @提及(一条消息可 @ 多人,独立成表)

| 字段 | 类型 | 说明 |
|---|---|---|
| `message_id` | TEXT | 关联消息 |
| `member_id` | TEXT | 被 @ 的成员 |

独立表便于触发规则查询"这条消息 @ 了哪些 AI",优于在 messages 里塞 JSON。

### AI 历史上下文来源(关键决策)

- **群消息以自己的 `messages` 表为唯一真相来源(single source of truth)。**
- AI 回复时,从 `messages` 读最近 N 条(默认 50,可配置),组装成 OpenAI 消息数组(每条标注发言人),作为上下文传给 Mastra agent 的 `.stream()`。
- **不使用 Mastra 自带 Memory 做群历史**——Mastra Memory 按 agent/thread 存储,而群历史是全体共享的同一份,用自己的表避免两份历史打架。Mastra 在此只做"单次带上下文的流式生成"。
- 上下文窗口默认 50 条,避免历史无限增长撑爆 token。

## 5. 核心数据流

以群里有真人**小明**、AI**产品经理**、AI**毒舌评论家**为例。

### 场景一:不 @ 任何人(全体 AI 回复)

1. 前端 `POST /api/messages { content }`。
2. 后端解析 @ → 无 @。
3. 后端写入 `messages`(status=complete),立即 `broadcast(message:new)` → 所有在线连接收到。
4. 触发规则:无 @ → 命中全体 AI。
5. 对每个 AI 并行启动回复任务:
   1. 插入一条 `status=streaming` 占位消息。
   2. 广播 `message:new`(streaming + 哪个 AI)→ 前端显示"正在输入…"气泡。
   3. 读最近 50 条 → 组装上下文 → `agent.stream()`。
   4. 每个增量 token → 广播 `message:delta { messageId, chunk }` → 前端追加(打字机)。
   5. 流结束 → 更新 `status=complete` + 完整内容 → 广播 `message:done`。
6. 多个 AI 各自独立跑步骤 5,互不等待。

### 场景二:@ 指定对象

- `@产品经理 ...`(AI):触发规则仅命中产品经理,毒舌评论家沉默。
- `@小红 ...`(真人):不触发任何 AI;广播 `message:new` 带 `mentions:[小红]`,前端给小红高亮/提醒。
- 混合 `@AI @真人`:被 @ 的 AI 回复 + 被 @ 的真人收到提醒。

### SSE 事件协议(后端→前端)

| 事件 | 时机 | 载荷 |
|---|---|---|
| `presence` | 成员上下线 | 当前在线成员列表 |
| `message:new` | 新消息产生(真人或 AI 占位) | 完整消息对象 + mentions |
| `message:delta` | AI 流式增量 | `{ messageId, chunk }` |
| `message:done` | AI 回复完成 | `{ messageId, content }` |
| `message:error` | AI 生成失败 | `{ messageId, error }` |

### @ 解析机制

- 前端 Composer 中 @ 为结构化选择:输入 `@` 弹出成员列表,选中后文本以 `@显示名` 呈现,同时把**被 @ 的 member_id 列表**随 POST 一起提交。
- 后端以前端传来的 member_id 列表为准做触发判断(不靠后端正则猜名字,避免重名/空格歧义);`content` 保留 `@显示名` 纯文本用于展示。

### 广播中心(BroadcastHub)

- 内存维护 `Map<连接ID, SSE 写入句柄>`。
- 提供 `broadcast(event)` 遍历所有连接推送。
- **所有"要让大家看到的事"只走这一个出口**(真人消息、AI 增量、上下线)——这是"所有人都能收到"的唯一实现点。

## 6. Mastra AI 编排与人设配置

### 人设配置文件(可改)

`server/config/agents.config.ts` 集中放 AI 角色,增删改只动这一个文件:

```ts
export const AI_PERSONAS = [
  {
    id: 'ai_pm',
    displayName: '产品经理',
    avatar: '📋',
    instructions: '你是一位资深产品经理,关注用户价值、可行性和优先级。回复简洁、给出可执行建议。',
  },
  {
    id: 'ai_critic',
    displayName: '毒舌评论家',
    avatar: '🔥',
    instructions: '你是一位犀利的评论家,擅长挑出方案的漏洞和风险。直言不讳但对事不对人。',
  },
  {
    id: 'ai_helper',
    displayName: '万能助手',
    avatar: '🤖',
    instructions: '你是一位友好的通用助手,有问必答,回复亲切清晰。',
  },
]
```

### Mastra 实例与 Agent 构建

- 服务启动时遍历 `AI_PERSONAS`,为每个人设创建 Mastra `Agent`(`instructions` 用人设提示词,`model` 用统一配置的 `openai/<model>`)。
- 注册进一个 `Mastra` 实例,业务层通过 `mastra.getAgent(id)` 获取。
- 同时把每个人设 **upsert 到 `members` 表**(`kind='ai'`),保证前端成员列表能显示、@ 能匹配。

> **实现注记**:具体模型名(如 `gpt-...`)在实现时用 Mastra 的 provider registry 脚本核实,不凭记忆写死。Mastra 要求 TS 编译目标 ES2022 + module ES2022/bundler。

### 模型配置(OpenAI 兼容层)

`server/config/model.config.ts`:

```ts
export const MODEL_CONFIG = {
  provider: 'openai',
  model: process.env.OPENAI_MODEL ?? 'gpt-...',  // 实现时用脚本核实可用模型名
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,           // 留空=官方;填了=兼容厂商
}
```

API Key 走 `.env`(进 `.gitignore`),不写进代码。

### 单次生成约定

群聊核心触发 AI 时调用统一函数 `generateReply(agentId, historyMessages)`:

1. 从 `messages` 取最近 50 条 → 转 Mastra/OpenAI 消息数组。
2. 每条历史标注发言人(如 `小明: 这个功能怎么做?`),让 AI 知道这是多人群聊且自己是谁。
3. 调 `agent.stream(messages)` 拿增量流。
4. 增量通过回调吐给广播中心(转 `message:delta`)。

**边界**:Mastra 层只负责"给定上下文 → 流式产出文本",不碰 SSE、不碰数据库写入、不懂 @ 规则。群聊核心负责编排;Mastra 负责生成。将来换实现只改 `generateReply` 内部。

### 多 AI 并发

不 @ 时多个 AI 同时触发,各自独立调 `agent.stream()` 并发跑。每个 AI 一条独立占位消息和独立 delta 流,前端靠 `messageId` 区分。

## 7. 错误处理与边界情况

### 错误处理

| 场景 | 处理方式 |
|---|---|
| AI 生成中途失败(API 报错/超时) | 占位消息标 `status=error`,广播 `message:error`;前端显示"⚠️ 生成失败",其他 AI 与群聊不受影响 |
| OpenAI 限流/网络抖动 | `generateReply` 内有限次重试(指数退避,约 2 次);仍失败走 error 流程 |
| 缺少 API Key / 配置错误 | 服务启动时校验配置,缺失则报错退出并打印清晰提示,不带病启动 |
| SSE 连接断开 | 浏览器 `EventSource` 自动重连;重连后前端拉一次最近历史(`GET /api/messages?limit=50`)补齐遗漏 |
| 真人发空消息 / 超长消息 | 后端校验:空消息拒绝;超长按上限截断或拒绝并返回明确错误 |
| @ 了不存在/已离线成员 | 以 member_id 为准;无效 ID 忽略,按"未命中有效 AI"处理,前端不报错 |
| 并发多 AI 写库 | better-sqlite3 同步写入天然串行,无并发竞争 |

### 边界情况

- **AI 之间不会无限互相 @ 触发**:**只解析真人发送时前端传来的 member_id 列表,不解析 AI 消息内容里的 @**。这是一条硬规则,杜绝 AI 互相 @ 死循环。
- **空群/只有 AI**:真人未进群时 AI 不主动说话(AI 仅被消息触发)。
- **同一真人多标签页**:每个标签页一条 SSE 连接,同一 member_id 可有多条连接,广播都推送。

## 8. 测试策略

使用 `vitest`。按可独立测试的单元组织:

1. **@ 解析 / 触发规则**(纯函数,重点):给定消息 + mentions + 成员表 → 断言应触发哪些 AI。覆盖五种情况:无@、@单AI、@多AI、@真人、@AI+真人混合。
2. **存储层**:用内存 SQLite,测消息写入/读取、status 流转(streaming→complete/error)、最近 N 条查询。
3. **广播中心**:用假连接句柄,断言 `broadcast` 把事件推给所有注册连接。
4. **generateReply**:用 mock 的 Mastra agent(不真调 OpenAI),断言上下文组装正确、增量正确转回调。
5. **端到端冒烟(手动)**:起服务,两个浏览器 tab,验证发消息、@、流式打字、断线重连。

真实 OpenAI 调用不进自动化测试(慢、要钱、不稳定),仅在手动冒烟时验证。

## 9. 非目标(明确不做,YAGNI)

- 多群、群管理、邀请
- 真人注册/密码/鉴权
- 消息编辑/撤回/已读回执/图片文件
- AI 主动发起话题、AI 之间互相对话

## 10. 技术选型可行性确认

- **Hono 可实现**(无需退回 Express):Hono 支持 SSE 流式响应(`hono/streaming`)与 WebSocket(`hono/ws`),覆盖实时广播与 AI 流式两个核心需求。本设计采用 SSE + POST。
- **Mastra 能力已核实**(基于官方 `llms.txt`):多 agent 独立 instructions/model ✓、流式 `.stream()` ✓、libSQL/SQLite 持久化 ✓、对话记忆 ✓、OpenAI provider 经 model router ✓。
