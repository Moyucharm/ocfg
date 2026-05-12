import type { ModelDraft } from "../core/types.js"

export const openAIGPT5Variants: NonNullable<ModelDraft["variants"]> = {
  none: {
    reasoningEffort: "none",
    reasoningSummary: "auto",
    textVerbosity: "medium",
  },
  low: {
    reasoningEffort: "low",
    reasoningSummary: "auto",
    textVerbosity: "medium",
  },
  medium: {
    reasoningEffort: "medium",
    reasoningSummary: "auto",
    textVerbosity: "medium",
  },
  high: {
    reasoningEffort: "high",
    reasoningSummary: "auto",
    textVerbosity: "medium",
  },
  xhigh: {
    reasoningEffort: "xhigh",
    reasoningSummary: "auto",
    textVerbosity: "medium",
  },
}

export function openAIGPT5Model(name: string): ModelDraft {
  return {
    name,
    limit: { context: 400000, output: 128000 },
    modalities: { input: ["text", "image"], output: ["text"] },
    attachment: true,
    reasoning: true,
    tool_call: true,
    temperature: false,
    variants: openAIGPT5Variants,
  }
}
