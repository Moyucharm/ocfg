import type { EndpointTemplate } from "./types.js"

export const anthropicCompatibleTemplate: EndpointTemplate = {
  kind: "anthropic-compatible",
  label: "Claude-compatible Anthropic Messages",
  recommendedNpm: "@ai-sdk/anthropic",
  baseURLHint: "https://api.anthropic.com/v1",
  supportsModelProbe: true,
}
