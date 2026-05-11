import { describe, expect, test } from "vitest"
import {
  addModel,
  addProvider,
  deleteModel,
  deleteProvider,
  findModelReferences,
  findProviderReferences,
  ProviderEditorError,
  setDefaultModel,
  setSmallModel,
  updateModel,
  updateProvider,
} from "../src/core/provider-editor.js"
import type { ProviderDraft } from "../src/core/types.js"

const draft: ProviderDraft = {
  id: "custom",
  name: "Custom",
  npm: "@ai-sdk/openai-compatible",
  options: { baseURL: "https://example.com/v1", apiKey: "{env:CUSTOM_API_KEY}" },
  models: {
    model: {
      name: "Model",
      limit: { context: 128000, output: 8192 },
    },
  },
}

describe("provider editor", () => {
  test("adds provider to empty config without mutating input", () => {
    const input = {}
    const next = addProvider(input, draft)
    expect(input).toEqual({})
    expect(next.$schema).toBe("https://opencode.ai/config.json")
    expect((next.provider as Record<string, unknown>).custom).toBeDefined()
  })

  test("rejects duplicate provider IDs", () => {
    const config = addProvider({}, draft)
    expect(() => addProvider(config, draft)).toThrow(ProviderEditorError)
  })

  test("updates provider fields", () => {
    const config = addProvider({}, draft)
    const next = updateProvider(config, "custom", { name: "Updated" })
    expect(((next.provider as any).custom as any).name).toBe("Updated")
    expect(((config.provider as any).custom as any).name).toBe("Custom")
  })

  test("adds and updates models", () => {
    const config = addProvider({}, { ...draft, models: {} })
    const withModel = addModel(config, "custom", "m1", { name: "M1" })
    const updated = updateModel(withModel, "custom", "m1", { limit: { context: 10, output: 2 } })
    expect(((updated.provider as any).custom.models.m1 as any).limit.context).toBe(10)
  })

  test("does not mutate input when deleting providers or models", () => {
    const config = addProvider({}, draft)
    const withoutModel = deleteModel(config, "custom", "model")
    const withoutProvider = deleteProvider(config, "custom")

    expect(((config.provider as any).custom.models as Record<string, unknown>).model).toBeDefined()
    expect((config.provider as Record<string, unknown>).custom).toBeDefined()
    expect(((withoutModel.provider as any).custom.models as Record<string, unknown>).model).toBeUndefined()
    expect((withoutProvider.provider as Record<string, unknown>).custom).toBeUndefined()
  })

  test("rejects duplicate model IDs", () => {
    const config = addProvider({}, draft)
    expect(() => addModel(config, "custom", "model", { name: "Duplicate" })).toThrow(ProviderEditorError)
  })

  test("sets default and small models", () => {
    const config = addProvider({}, draft)
    const withDefault = setDefaultModel(config, "custom/model")
    const withSmall = setSmallModel(withDefault, "custom/model")
    expect(config.model).toBeUndefined()
    expect(withDefault.small_model).toBeUndefined()
    expect(withSmall.model).toBe("custom/model")
    expect(withSmall.small_model).toBe("custom/model")
  })

  test("rejects updating or deleting missing entries", () => {
    const config = addProvider({}, draft)
    expect(() => updateProvider(config, "missing", { name: "Nope" })).toThrow(ProviderEditorError)
    expect(() => updateModel(config, "custom", "missing", { name: "Nope" })).toThrow(ProviderEditorError)
    expect(() => deleteProvider(config, "missing")).toThrow(ProviderEditorError)
    expect(() => deleteModel(config, "custom", "missing")).toThrow(ProviderEditorError)
  })

  test("finds provider and model references", () => {
    const config = { model: "custom/model", small_model: "custom/small" }
    expect(findProviderReferences(config, "custom")).toEqual(["/model", "/small_model"])
    expect(findModelReferences(config, "custom", "model")).toEqual(["/model"])
  })

  test("blocks deleting referenced provider without token", () => {
    const config = { ...addProvider({}, draft), model: "custom/model" }
    expect(() => deleteProvider(config, "custom")).toThrow(ProviderEditorError)
  })

  test("blocks deleting provider referenced by small_model without token", () => {
    const config = { ...addProvider({}, draft), small_model: "custom/model" }
    expect(() => deleteProvider(config, "custom")).toThrow(ProviderEditorError)
  })

  test("allows deleting referenced provider with token", () => {
    const config = { ...addProvider({}, draft), model: "custom/model" }
    const next = deleteProvider(config, "custom", { confirmReferencedDelete: "delete:custom" })
    expect((next.provider as Record<string, unknown>).custom).toBeUndefined()
  })

  test("blocks deleting referenced model without token", () => {
    const config = { ...addProvider({}, draft), model: "custom/model" }
    expect(() => deleteModel(config, "custom", "model")).toThrow(ProviderEditorError)
  })

  test("blocks deleting model referenced by small_model without token", () => {
    const config = { ...addProvider({}, draft), small_model: "custom/model" }
    expect(() => deleteModel(config, "custom", "model")).toThrow(ProviderEditorError)
  })

  test("allows deleting referenced model with token", () => {
    const config = { ...addProvider({}, draft), model: "custom/model" }
    const next = deleteModel(config, "custom", "model", { confirmReferencedDelete: "delete:custom/model" })
    expect(((next.provider as any).custom.models as Record<string, unknown>).model).toBeUndefined()
  })
})
