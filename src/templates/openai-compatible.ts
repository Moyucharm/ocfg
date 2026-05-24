import type { EndpointTemplate } from "./types.js"

export const openAICompatibleTemplate: EndpointTemplate = {
  kind: "openai-compatible",
  label: "OpenAI-compatible Chat Completions",
  recommendedNpm: "@ai-sdk/openai-compatible",
  baseURLHint: "https://api.openai.com/v1",
  supportsModelProbe: true,
}
