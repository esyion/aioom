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
