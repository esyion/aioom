import { Mastra } from '@mastra/core'
import { Agent } from '@mastra/core/agent'
import { AI_PERSONAS } from '../config/agents.config.ts'
import { MODEL_CONFIG } from '../config/model.config.ts'

const agents = Object.fromEntries(
  AI_PERSONAS.map((p) => [
    p.id,
    new Agent({ id: p.id, name: p.displayName, instructions: p.instructions, model: MODEL_CONFIG.model }),
  ]),
)

export const mastra = new Mastra({ agents })

export function getAgent(id: string): Agent {
  // 用 getAgentById(而非 getAgent)以拿到挂载实例级共享服务的 agent。
  const a = mastra.getAgentById(id)
  if (!a) throw new Error(`[mastra] 未找到 agent: ${id}`)
  return a
}

/** 单次带上下文的流式生成。每个增量回调 onDelta;返回完整文本。 */
export async function generateReply(
  agentId: string,
  context: { role: 'user' | 'assistant'; content: string }[],
  onDelta: (chunk: string) => void,
): Promise<string> {
  const agent = getAgent(agentId)
  // 映射成每个元素带字面量 role 的判别联合,以匹配 Mastra 的 CoreMessage 入参类型
  // (直接传 role: 'user' | 'assistant' 的数组无法被 TS 收窄到具体消息类型)。
  const messages = context.map((m) =>
    m.role === 'assistant'
      ? { role: 'assistant' as const, content: m.content }
      : { role: 'user' as const, content: m.content },
  )
  const stream = await agent.stream(messages)
  let full = ''
  for await (const chunk of stream.textStream) {
    full += chunk
    onDelta(chunk)
  }
  return full
}
