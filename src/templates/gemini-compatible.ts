import type { EndpointTemplate } from "./types.js"

export const geminiCompatibleTemplate: EndpointTemplate = {
  kind: "gemini-compatible",
  label: "Gemini-compatible / Google Generative AI",
  recommendedNpm: "@ai-sdk/google",
  baseURLHint: "https://generativelanguage.googleapis.com/v1beta",
  supportsModelProbe: true,
}
