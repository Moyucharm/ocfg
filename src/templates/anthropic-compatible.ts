import type { EndpointTemplate } from "./types.js"

export const anthropicCompatibleTemplate: EndpointTemplate = {
  kind: "anthropic-compatible",
  label: "Claude-compatible Anthropic Messages",
  recommendedNpm: "@ai-sdk/anthropic",
  baseURLHint: "https://example.com/v1",
  supportsModelProbe: false,
  genericModel: {
    name: "Claude-compatible Model",
    limit: { context: 200000, output: 8192 },
    modalities: { input: ["text"], output: ["text"] },
    tool_call: true,
    temperature: true,
  },
  families: [
    {
      family: "claude-sonnet-4",
      match: /claude.*sonnet.*4/i,
      model: {
        name: "Claude Sonnet 4 Compatible",
        limit: { context: 200000, output: 64000 },
        modalities: { input: ["text", "image", "pdf"], output: ["text"] },
        attachment: true,
        reasoning: true,
        tool_call: true,
        temperature: true,
        options: { thinking: { type: "enabled", budgetTokens: 16000 } },
      },
    },
    {
      family: "claude-opus-4",
      match: /claude.*opus.*4/i,
      model: {
        name: "Claude Opus 4 Compatible",
        limit: { context: 200000, output: 32000 },
        modalities: { input: ["text", "image", "pdf"], output: ["text"] },
        attachment: true,
        reasoning: true,
        tool_call: true,
        temperature: true,
        options: { thinking: { type: "enabled", budgetTokens: 16000 } },
      },
    },
  ],
}
