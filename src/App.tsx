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
