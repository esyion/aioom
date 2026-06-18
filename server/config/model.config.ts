export const MODEL_CONFIG = {
  // 'openai/<model>' 形式;具体模型名用 OPENAI_MODEL 注入,默认值占位
  model: `openai/${process.env.OPENAI_MODEL ?? 'gpt-4o-mini'}`,
  apiKey: process.env.OPENAI_API_KEY ?? '',
  baseURL: process.env.OPENAI_BASE_URL || undefined,
}

export function assertModelConfig(): void {
  if (!MODEL_CONFIG.apiKey) {
    throw new Error('[config] 缺少 OPENAI_API_KEY,请在 .env 中配置')
  }
}
