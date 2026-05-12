import type { EndpointKind } from "./types.js"
import { getEndpointTemplate } from "../templates/index.js"

export type ChannelTypeOption = {
  kind: EndpointKind
  label: string
  description: string
}

export const channelTypeOptions: ChannelTypeOption[] = [
  {
    kind: "openai-compatible",
    label: "OpenAI compatible",
    description: "Chat Completions compatible endpoints",
  },
  {
    kind: "openai-responses",
    label: "OpenAI Responses",
    description: "OpenAI Responses API endpoints",
  },
  {
    kind: "anthropic-compatible",
    label: "Anthropic compatible",
    description: "Anthropic Messages compatible endpoints",
  },
  {
    kind: "gemini-compatible",
    label: "Gemini compatible",
    description: "Google Generative AI compatible endpoints",
  },
]

export function recommendedNpmForChannelType(kind: EndpointKind) {
  return getEndpointTemplate(kind).recommendedNpm
}

export function channelTypeLabel(kind: EndpointKind) {
  return channelTypeOptions.find((option) => option.kind === kind)?.label ?? kind
}
