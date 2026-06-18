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
