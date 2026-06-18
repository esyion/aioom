import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const searchTool = createTool({
  id: "web-search",
  description: "联网搜索资料,返回摘要",
  inputSchema: z.object({ query: z.string() }),
  outputSchema: z.object({ result: z.string() }),
  execute: async (inputData) => {
    const { query } = inputData;
    // ... 真实调用搜索 API
    debugger;
    console.log(query);

    return { result: "啥也没搜到" };
  },
});
