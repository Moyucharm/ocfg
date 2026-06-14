import { describe, expect, test } from "vitest"
import { mergeGeneratedVariants, variantsFromReasoningOptions } from "../src/core/reasoning-variants.js"
import type { ModelsDevModel } from "../src/core/models-dev.js"
import type { EndpointKind } from "../src/core/types.js"

const endpointKinds = ["openai-compatible", "openai-responses", "anthropic-compatible", "gemini-compatible"] as const

function modelWithReasoningOptions(reasoning_options: ModelsDevModel["reasoning_options"], patch: Partial<ModelsDevModel> = {}): ModelsDevModel {
  return {
    id: "test-reasoning-model",
    name: "Test Reasoning Model",
    reasoning: true,
    limit: { context: 200000, output: 64000 },
    reasoning_options,
    ...patch,
  }
}

describe("reasoning variants", () => {
  test.each(endpointKinds)("keeps generic effort fallback for %s", (endpointKind) => {
    const variants = variantsFromReasoningOptions({
      endpointKind,
      model: modelWithReasoningOptions([{ type: "effort", values: ["high", "max", "default", "null", null] }]),
    })

    expect(Object.keys(variants ?? {})).toEqual(["high", "max"])
    if (endpointKind === "openai-compatible") {
      expect(variants?.high).toEqual({ reasoningEffort: "high" })
      expect(variants?.max).toEqual({ reasoningEffort: "max" })
    }
    if (endpointKind === "openai-responses") {
      expect(variants?.high).toEqual({
        reasoningEffort: "high",
        reasoningSummary: "auto",
        include: ["reasoning.encrypted_content"],
      })
    }
    if (endpointKind === "anthropic-compatible") {
      expect(variants?.high).toEqual({ thinking: { type: "adaptive" }, effort: "high" })
      expect(variants?.max).toEqual({ thinking: { type: "adaptive" }, effort: "max" })
    }
    if (endpointKind === "gemini-compatible") {
      expect(variants?.high).toEqual({ thinkingConfig: { includeThoughts: true, thinkingLevel: "high" } })
      expect(variants?.max).toEqual({ thinkingConfig: { includeThoughts: true, thinkingLevel: "max" } })
    }
  })

  test.each(endpointKinds)("keeps generic toggle fallback for %s", (endpointKind) => {
    const variants = variantsFromReasoningOptions({
      endpointKind,
      model: modelWithReasoningOptions([{ type: "toggle" }]),
    })

    expect(Object.keys(variants ?? {})).toEqual(["none", "thinking"])
    if (endpointKind === "openai-compatible") {
      expect(variants?.none).toEqual({ thinking: { type: "disabled" } })
      expect(variants?.thinking).toEqual({ thinking: { type: "enabled" } })
    }
    if (endpointKind === "openai-responses") {
      expect(variants?.none).toMatchObject({ reasoningEffort: "none" })
      expect(variants?.thinking).toMatchObject({ reasoningEffort: "high" })
    }
    if (endpointKind === "anthropic-compatible") {
      expect(variants?.none).toEqual({ thinking: { type: "disabled" } })
      expect(variants?.thinking).toEqual({ thinking: { type: "enabled" } })
    }
    if (endpointKind === "gemini-compatible") {
      expect(variants?.none).toEqual({ thinkingConfig: { thinkingBudget: 0 } })
      expect(variants?.thinking).toEqual({ thinkingConfig: { includeThoughts: true } })
    }
  })

  test("generates budget token variants for compatible endpoints", () => {
    const anthropic = variantsFromReasoningOptions({
      endpointKind: "anthropic-compatible",
      model: modelWithReasoningOptions([{ type: "budget_tokens", min: 1024 }]),
    })
    expect(anthropic?.high).toEqual({ thinking: { type: "enabled", budgetTokens: 16000 } })
    expect(anthropic?.max).toEqual({ thinking: { type: "enabled", budgetTokens: 31999 } })

    const gemini = variantsFromReasoningOptions({
      endpointKind: "gemini-compatible",
      model: modelWithReasoningOptions([{ type: "budget_tokens", min: 0, max: 24576 }]),
    })
    expect(gemini?.none).toEqual({ thinkingConfig: { thinkingBudget: 0 } })
    expect(gemini?.high).toEqual({ thinkingConfig: { includeThoughts: true, thinkingBudget: 16000 } })
    expect(gemini?.max).toEqual({ thinkingConfig: { includeThoughts: true, thinkingBudget: 24576 } })
  })

  test("does not invent budget token variants for OpenAI Responses", () => {
    const variants = variantsFromReasoningOptions({
      endpointKind: "openai-responses",
      model: modelWithReasoningOptions([{ type: "budget_tokens", min: 1024 }]),
    })

    expect(variants).toBeUndefined()
  })

  test("uses non-adaptive Anthropic effort options for Claude Opus 4.5", () => {
    const variants = variantsFromReasoningOptions({
      endpointKind: "anthropic-compatible",
      model: modelWithReasoningOptions([{ type: "effort", values: ["low", "medium", "high"] }], {
        id: "claude-opus-4-5",
        name: "Claude Opus 4.5",
      }),
    })

    expect(variants?.low).toEqual({ effort: "low" })
    expect(variants?.medium).toEqual({ effort: "medium" })
    expect(variants?.high).toEqual({ effort: "high" })
  })

  test("uses OpenAI effort variants for GPT models regardless of compatible endpoint", () => {
    const variants = variantsFromReasoningOptions({
      endpointKind: "openai-compatible",
      providerID: "openai",
      modelID: "gpt-5.5",
      model: modelWithReasoningOptions([{ type: "effort", values: ["none", "low", "medium", "high", "xhigh"] }], {
        id: "gpt-5.5",
        name: "GPT-5.5",
      }),
    })

    expect(variants).toEqual({
      none: { reasoningEffort: "none" },
      low: { reasoningEffort: "low" },
      medium: { reasoningEffort: "medium" },
      high: { reasoningEffort: "high" },
      xhigh: { reasoningEffort: "xhigh" },
    })
  })

  test("uses Google thinkingConfig for Gemini models on OpenAI-compatible endpoints", () => {
    const variants = variantsFromReasoningOptions({
      endpointKind: "openai-compatible",
      providerID: "google",
      modelID: "gemini-3.5-flash",
      model: modelWithReasoningOptions([{ type: "effort", values: ["minimal", "low", "medium", "high"] }], {
        id: "gemini-3.5-flash",
        name: "Gemini 3.5 Flash",
      }),
    })

    expect(variants?.minimal).toEqual({ thinkingConfig: { includeThoughts: true, thinkingLevel: "minimal" } })
    expect(variants?.high).toEqual({ thinkingConfig: { includeThoughts: true, thinkingLevel: "high" } })
    expect(variants?.high).not.toHaveProperty("reasoningEffort")
  })

  test("uses DeepSeek official fields for OpenAI and Anthropic formats", () => {
    const openai = variantsFromReasoningOptions({
      endpointKind: "openai-compatible",
      providerID: "deepseek",
      modelID: "deepseek-v4-pro",
      model: modelWithReasoningOptions([{ type: "toggle" }, { type: "effort", values: ["low", "high", "xhigh", "max"] }], {
        id: "deepseek-v4-pro",
        name: "DeepSeek V4 Pro",
      }),
    })
    expect(openai?.none).toEqual({ thinking: { type: "disabled" } })
    expect(openai?.thinking).toEqual({ thinking: { type: "enabled" } })
    expect(openai?.low).toEqual({ thinking: { type: "enabled" }, reasoning_effort: "high" })
    expect(openai?.xhigh).toEqual({ thinking: { type: "enabled" }, reasoning_effort: "max" })
    expect(openai?.max).toEqual({ thinking: { type: "enabled" }, reasoning_effort: "max" })

    const anthropic = variantsFromReasoningOptions({
      endpointKind: "anthropic-compatible",
      providerID: "deepseek",
      modelID: "deepseek-v4-pro",
      model: modelWithReasoningOptions([{ type: "effort", values: ["high", "max"] }], {
        id: "deepseek-v4-pro",
        name: "DeepSeek V4 Pro",
      }),
    })
    expect(anthropic?.high).toEqual({ thinking: { type: "enabled" }, output_config: { effort: "high" } })
    expect(anthropic?.max).toEqual({ thinking: { type: "enabled" }, output_config: { effort: "max" } })
  })

  test("keeps adaptive Anthropic effort options for Claude Opus 4.8", () => {
    const variants = variantsFromReasoningOptions({
      endpointKind: "anthropic-compatible",
      model: modelWithReasoningOptions([{ type: "effort", values: ["low", "max"] }], {
        id: "claude-opus-4-8",
        name: "Claude Opus 4.8",
      }),
    })

    expect(variants?.low).toEqual({ thinking: { type: "adaptive" }, effort: "low" })
    expect(variants?.max).toEqual({ thinking: { type: "adaptive" }, effort: "max" })
  })

  test("uses confirmed Z.AI thinking switch for GLM effort metadata", () => {
    const variants = variantsFromReasoningOptions({
      endpointKind: "anthropic-compatible",
      providerID: "zai-coding-plan",
      modelID: "glm-5.2",
      model: modelWithReasoningOptions([{ type: "effort", values: ["high", "max"] }], {
        id: "glm-5.2",
        name: "GLM-5.2",
      }),
    })

    expect(variants?.high).toEqual({ thinking: { type: "enabled" } })
    expect(variants?.max).toEqual({ thinking: { type: "enabled" } })
  })

  test("uses Moonshot and Xiaomi thinking switches without guessing effort fields", () => {
    const kimi = variantsFromReasoningOptions({
      endpointKind: "openai-compatible",
      providerID: "moonshotai",
      modelID: "kimi-k2.5",
      model: modelWithReasoningOptions([{ type: "effort", values: ["none", "low", "high"] }], {
        id: "kimi-k2.5",
        name: "Kimi K2.5",
      }),
    })
    expect(kimi?.none).toEqual({ thinking: { type: "disabled" } })
    expect(kimi?.low).toEqual({ thinking: { type: "enabled" } })
    expect(kimi?.high).toEqual({ thinking: { type: "enabled" } })

    const mimo = variantsFromReasoningOptions({
      endpointKind: "openai-compatible",
      providerID: "xiaomi",
      modelID: "mimo-v2.5-pro",
      model: modelWithReasoningOptions([{ type: "toggle" }], {
        id: "mimo-v2.5-pro",
        name: "MiMo V2.5 Pro",
      }),
    })
    expect(mimo).toEqual({ none: { thinking: { type: "disabled" } }, thinking: { thinking: { type: "enabled" } } })
  })

  test("uses Alibaba enable_thinking and thinking_budget fields for Qwen", () => {
    const variants = variantsFromReasoningOptions({
      endpointKind: "openai-compatible",
      providerID: "alibaba-token-plan",
      modelID: "qwen3.7-plus",
      model: modelWithReasoningOptions([{ type: "toggle" }, { type: "budget_tokens", max: 262144 }], {
        id: "qwen3.7-plus",
        name: "Qwen3.7 Plus",
      }),
    })

    expect(variants?.none).toEqual({ enable_thinking: false })
    expect(variants?.thinking).toEqual({ enable_thinking: true })
    expect(variants?.high).toEqual({ enable_thinking: true, thinking_budget: 16000 })
    expect(variants?.max).toEqual({ enable_thinking: true, thinking_budget: 63999 })
  })

  test("uses adaptive thinking for MiniMax M3 toggle variants on compatible endpoints", () => {
    for (const endpointKind of ["openai-compatible", "anthropic-compatible"] as const) {
      const variants = variantsFromReasoningOptions({
        endpointKind,
        model: modelWithReasoningOptions([{ type: "toggle" }], {
          id: "MiniMax-M3",
          name: "MiniMax-M3",
        }),
      })

      expect(variants?.none).toEqual({ thinking: { type: "disabled" } })
      expect(variants?.thinking).toEqual({ thinking: { type: "adaptive" } })
    }
  })

  test("keeps enabled thinking for non-MiniMax toggle variants", () => {
    const variants = variantsFromReasoningOptions({
      endpointKind: "anthropic-compatible",
      model: modelWithReasoningOptions([{ type: "toggle" }], {
        id: "kimi-k2.5",
        name: "Kimi K2.5",
      }),
    })

    expect(variants?.none).toEqual({ thinking: { type: "disabled" } })
    expect(variants?.thinking).toEqual({ thinking: { type: "enabled" } })
  })

  test("requires models.dev to explicitly report reasoning options", () => {
    expect(variantsFromReasoningOptions({ endpointKind: "openai-compatible", model: modelWithReasoningOptions(undefined) })).toBeUndefined()
    expect(variantsFromReasoningOptions({ endpointKind: "openai-compatible", model: modelWithReasoningOptions([{ type: "toggle" }], { reasoning: false }) })).toBeUndefined()
  })

  test("keeps existing variants when adding generated ones", () => {
    const merged = mergeGeneratedVariants({
      existing: { high: { custom: true } },
      generated: { high: { reasoningEffort: "high" }, low: { reasoningEffort: "low" } },
    })

    expect(merged).toEqual({ high: { custom: true }, low: { reasoningEffort: "low" } })
  })
})
