import type { EndpointTemplate } from "./types.js"

export const geminiCompatibleTemplate: EndpointTemplate = {
  kind: "gemini-compatible",
  label: "Gemini-compatible / Google Generative AI",
  recommendedNpm: "@ai-sdk/google",
  baseURLHint: "https://generativelanguage.googleapis.com/v1beta",
  supportsModelProbe: true,
  genericModel: {
    name: "Gemini-compatible Model",
    limit: { context: 128000, output: 8192 },
    modalities: { input: ["text"], output: ["text"] },
    tool_call: true,
    temperature: true,
  },
  families: [
    {
      family: "gemini-3",
      match: /gemini-3/i,
      model: {
        name: "Gemini 3 Compatible",
        limit: { context: 1000000, output: 65536 },
        modalities: { input: ["text", "image", "pdf", "audio", "video"], output: ["text"] },
        attachment: true,
        reasoning: true,
        tool_call: true,
        temperature: true,
      },
    },
    {
      family: "gemini-2.5",
      match: /gemini-2\.5/i,
      model: {
        name: "Gemini 2.5 Compatible",
        limit: { context: 1000000, output: 65536 },
        modalities: { input: ["text", "image", "pdf", "audio", "video"], output: ["text"] },
        attachment: true,
        reasoning: true,
        tool_call: true,
        temperature: true,
      },
    },
  ],
}
