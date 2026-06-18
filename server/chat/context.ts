import type { Message, Member } from '../../shared/types.ts'

export function buildContext(
  messages: Message[],
  members: Member[],
  selfId: string,
): { role: 'user' | 'assistant'; content: string }[] {
  const nameOf = new Map(members.map((m) => [m.id, m.displayName]))
  const out: { role: 'user' | 'assistant'; content: string }[] = []
  for (const m of messages) {
    if (m.content === '') continue // 跳过流式占位空消息
    if (m.senderId === selfId) {
      out.push({ role: 'assistant', content: m.content })
    } else {
      const name = nameOf.get(m.senderId) ?? m.senderId
      out.push({ role: 'user', content: `${name}: ${m.content}` })
    }
  }
  return out
}
