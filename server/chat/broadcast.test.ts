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
