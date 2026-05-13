import { describe, expect, test } from "vitest"
import { applyDefaultModelSelection, collectDefaultModelOptions, isSelectableDefaultModelRef } from "../src/tui/default-model.js"

describe("default model TUI helpers", () => {
  test("collects an empty option before existing model refs", () => {
    const options = collectDefaultModelOptions({
      provider: {
        custom: {
          name: "Custom Provider",
          models: {
            chat: { name: "Chat Model" },
            small: {},
          },
        },
      },
    })

    expect(options.map((option) => option.ref)).toEqual([undefined, "custom/chat", "custom/small"])
    expect(options[0]?.label).toBe("(empty)")
    expect(options[1]?.label).toBe("custom/chat (Custom Provider / Chat Model)")
    expect(isSelectableDefaultModelRef(options, "custom/chat")).toBe(true)
  })

  test("ignores malformed providers and providers without models", () => {
    const options = collectDefaultModelOptions({
      provider: {
        invalid: "nope",
        empty: {},
        malformedModels: { models: [] },
      },
    })

    expect(options).toEqual([{ label: "(empty)", description: "Clear this setting" }])
    expect(isSelectableDefaultModelRef(options, "missing/model")).toBe(false)
  })

  test("sets model and small_model without mutating input", () => {
    const input = { provider: { custom: { models: { chat: {} } } } }
    const withModel = applyDefaultModelSelection(input, "model", "custom/chat")
    const withSmallModel = applyDefaultModelSelection(withModel, "small_model", "custom/chat")

    expect(input).toEqual({ provider: { custom: { models: { chat: {} } } } })
    expect(withModel.model).toBe("custom/chat")
    expect(withModel.$schema).toBe("https://opencode.ai/config.json")
    expect(withSmallModel.small_model).toBe("custom/chat")
  })

  test("empty selection clears the chosen default field", () => {
    const input = { model: "custom/chat", small_model: "custom/small", provider: { custom: { models: { chat: {}, small: {} } } } }

    const withoutModel = applyDefaultModelSelection(input, "model")
    const withoutSmallModel = applyDefaultModelSelection(input, "small_model")

    expect(withoutModel.model).toBeUndefined()
    expect(withoutModel.small_model).toBe("custom/small")
    expect(withoutSmallModel.model).toBe("custom/chat")
    expect(withoutSmallModel.small_model).toBeUndefined()
    expect(input.model).toBe("custom/chat")
    expect(input.small_model).toBe("custom/small")
  })
})
