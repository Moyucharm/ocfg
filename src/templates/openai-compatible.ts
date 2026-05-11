import type { EndpointTemplate } from "./types.js"

export const openAICompatibleTemplate: EndpointTemplate = {
  kind: "openai-compatible",
  label: "OpenAI-compatible Chat Completions",
  recommendedNpm: "@ai-sdk/openai-compatible",
  baseURLHint: "https://example.com/v1",
  supportsModelProbe: true,
  genericModel: {
    name: "OpenAI-compatible Model",
    limit: { context: 128000, output: 8192 },
    modalities: { input: ["text"], output: ["text"] },
    tool_call: true,
    temperature: true,
  },
  families: [
    {
      family: "gpt-5",
      match: /(^|[/_-])gpt-5/i,
      model: {
        name: "GPT-5 Compatible",
        limit: { context: 400000, output: 128000 },
        modalities: { input: ["text", "image"], output: ["text"] },
        attachment: true,
        reasoning: true,
        tool_call: true,
        temperature: true,
      },
    },
    {
      family: "gpt-4.1",
      match: /gpt-4\.1/i,
      model: {
        name: "GPT-4.1 Compatible",
        limit: { context: 1000000, output: 32768 },
        modalities: { input: ["text", "image"], output: ["text"] },
        attachment: true,
        tool_call: true,
        temperature: true,
      },
    },
  ],
}
