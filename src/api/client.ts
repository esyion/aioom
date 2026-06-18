import type { Member, Message, PostMessageBody, JoinBody } from '../../shared/types.ts'

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`)
  return res.json() as Promise<T>
}

export const client = {
  join: (displayName: string) =>
    fetch('/api/members/join', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName } satisfies JoinBody),
    }).then((r) => json<Member>(r)),
  fetchMessages: (limit = 50) =>
    fetch(`/api/messages?limit=${limit}`).then((r) => json<Message[]>(r)),
  fetchMembers: () => fetch('/api/members').then((r) => json<Member[]>(r)),
  postMessage: (body: PostMessageBody) =>
    fetch('/api/messages', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => json<Message>(r)),
}
