import type { EndpointKind } from "../core/types.js"
import { anthropicCompatibleTemplate } from "./anthropic-compatible.js"
import { geminiCompatibleTemplate } from "./gemini-compatible.js"
import { openAICompatibleTemplate } from "./openai-compatible.js"
import { openAIResponsesTemplate } from "./openai-responses.js"
import type { EndpointTemplate } from "./types.js"

export const endpointTemplates: Record<EndpointKind, EndpointTemplate> = {
  "openai-compatible": openAICompatibleTemplate,
  "openai-responses": openAIResponsesTemplate,
  "anthropic-compatible": anthropicCompatibleTemplate,
  "gemini-compatible": geminiCompatibleTemplate,
}

export function getEndpointTemplate(kind: EndpointKind): EndpointTemplate {
  return endpointTemplates[kind]
}

export type { EndpointTemplate } from "./types.js"
