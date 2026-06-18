import type { Member } from '../../shared/types.ts'

export function MemberList({ members }: { members: Member[] }) {
  return (
    <aside className="member-list">
      <h3>成员 ({members.length})</h3>
      <ul>
        {members.map((m) => (
          <li key={m.id} className={m.kind === 'ai' ? 'ai' : 'human'}>
            <span className="avatar">{m.avatar || (m.kind === 'ai' ? '🤖' : '🙂')}</span>
            <span className="name">{m.displayName}</span>
            {m.kind === 'ai' && <span className="tag">AI</span>}
            {m.kind === 'human' && <span className={m.online ? 'dot on' : 'dot off'} />}
          </li>
        ))}
      </ul>
    </aside>
  )
}
