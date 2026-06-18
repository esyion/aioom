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
