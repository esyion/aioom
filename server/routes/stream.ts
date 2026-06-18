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
