import type { Member } from '../../shared/types.ts'

/**
 * 根据被 @ 的成员 id 列表决定哪些 AI 应该回复。
 * - 不解析任何文本,只看传入的 mentions 数组(硬规则:杜绝 AI 互相 @ 死循环)。
 * - mentions 为空 → 所有 AI 都触发。
 * - mentions 含 AI → 仅触发其中的 AI。
 * - mentions 只含真人/无效 id → 不触发任何 AI。
 */
export function resolveTriggeredAis(mentions: string[], aiMembers: Member[]): string[] {
  const aiIds = new Set(aiMembers.map((m) => m.id))
  if (mentions.length === 0) {
    return [...aiIds]
  }
  return mentions.filter((id) => aiIds.has(id))
}
