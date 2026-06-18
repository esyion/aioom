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
