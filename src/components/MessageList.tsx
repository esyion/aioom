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
