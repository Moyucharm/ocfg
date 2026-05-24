import type { EndpointTemplate } from "./types.js"

export const openAIResponsesTemplate: EndpointTemplate = {
  kind: "openai-responses",
  label: "OpenAI Responses",
  recommendedNpm: "@ai-sdk/openai",
  baseURLHint: "https://api.openai.com/v1",
  supportsModelProbe: true,
}
