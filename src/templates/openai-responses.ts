import type { EndpointTemplate } from "./types.js"
import { openAIGPT5Model } from "./openai-gpt.js"

export const openAIResponsesTemplate: EndpointTemplate = {
  kind: "openai-responses",
  label: "OpenAI Responses",
  recommendedNpm: "@ai-sdk/openai",
  baseURLHint: "https://api.openai.com/v1",
  supportsModelProbe: true,
  genericModel: {
    name: "OpenAI Responses Model",
    limit: { context: 128000, output: 16384 },
    modalities: { input: ["text"], output: ["text"] },
    tool_call: true,
    temperature: true,
  },
  families: [
    {
      family: "gpt-5",
      match: /(^|[/_-])gpt-5/i,
      model: openAIGPT5Model("GPT-5"),
    },
    {
      family: "o-series",
      match: /(^|[/_-])o[134](-|$)|(^|[/_-])o[134]-/i,
      model: {
        name: "OpenAI Reasoning Model",
        limit: { context: 200000, output: 100000 },
        modalities: { input: ["text", "image"], output: ["text"] },
        attachment: true,
        reasoning: true,
        tool_call: true,
      },
    },
  ],
}
