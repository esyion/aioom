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
