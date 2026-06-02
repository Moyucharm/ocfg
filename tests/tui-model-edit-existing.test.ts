import { describe, expect, test } from "vitest"
import { canUseGpt5LongContextPreset, gpt5LongContextState } from "../src/core/model-limit-presets.js"
import { buildExistingModelEditPatch, ModelEditDraftError } from "../src/tui/model-edit-existing.js"

describe("existing model TUI edit helper", () => {
  test("updates name without touching other fields", () => {
    expect(buildExistingModelEditPatch({ name: "Old", limit: { context: 1, output: 2 } }, { name: "New" })).toEqual({ name: "New" })
  })

  test("updates context while preserving output", () => {
    expect(buildExistingModelEditPatch({ limit: { context: 1, output: 2 } }, { context: 100 })).toEqual({
      limit: { context: 100, output: 2 },
    })
  })

  test("updates context while preserving input", () => {
    expect(buildExistingModelEditPatch({ limit: { context: 1, input: 10, output: 2 } }, { context: 100 })).toEqual({
      limit: { context: 100, input: 10, output: 2 },
    })
  })

  test("updates input while preserving context and output", () => {
    expect(buildExistingModelEditPatch({ limit: { context: 1, input: 10, output: 2 } }, { input: 20 })).toEqual({
      limit: { context: 1, input: 20, output: 2 },
    })
  })

  test("updates output while preserving context", () => {
    expect(buildExistingModelEditPatch({ limit: { context: 1, output: 2 } }, { output: 20 })).toEqual({
      limit: { context: 1, output: 20 },
    })
  })

  test("requires a complete limit when current limit is missing", () => {
    expect(() => buildExistingModelEditPatch({}, { context: 100 })).toThrow(ModelEditDraftError)
    expect(buildExistingModelEditPatch({}, { context: 100, output: 20 })).toEqual({ limit: { context: 100, output: 20 } })
  })

  test("rejects non-positive limits", () => {
    expect(() => buildExistingModelEditPatch({ limit: { context: 1, output: 2 } }, { context: 0 })).toThrow(ModelEditDraftError)
    expect(() => buildExistingModelEditPatch({ limit: { context: 1, output: 2 } }, { input: 0 })).toThrow(ModelEditDraftError)
    expect(() => buildExistingModelEditPatch({ limit: { context: 1, output: 2 } }, { output: -1 })).toThrow(ModelEditDraftError)
  })

  test("applies GPT-5 long context preset", () => {
    expect(buildExistingModelEditPatch({}, { gpt5LongContext: true })).toEqual({
      limit: { context: 1050000, input: 922000, output: 128000 },
    })
    expect(buildExistingModelEditPatch({}, { gpt5LongContext: false })).toEqual({
      limit: { context: 400000, input: 272000, output: 128000 },
    })
  })

  test("detects existing GPT-5 long context state", () => {
    expect(gpt5LongContextState({ limit: { context: 1000000, output: 128000 } })).toBe(true)
    expect(gpt5LongContextState({ limit: { context: 1050000, input: 922000, output: 128000 } })).toBe(true)
    expect(gpt5LongContextState({ limit: { context: 400000, input: 272000, output: 128000 } })).toBe(false)
    expect(gpt5LongContextState({ limit: { context: 800000, input: 500000, output: 64000 } })).toBeUndefined()
  })

  test("only shows GPT-5 preset for official model IDs", () => {
    expect(canUseGpt5LongContextPreset("gpt-5.5")).toBe(true)
    expect(canUseGpt5LongContextPreset("openai/gpt-5.5")).toBe(true)
    expect(canUseGpt5LongContextPreset("gpt5.5")).toBe(false)
    expect(canUseGpt5LongContextPreset("openai-gpt-5.5")).toBe(false)
  })

  test("maps boolean capability fields", () => {
    expect(
      buildExistingModelEditPatch(
        {},
        { reasoning: false, toolCall: true, temperature: false, attachment: true },
      ),
    ).toEqual({ reasoning: false, tool_call: true, temperature: false, attachment: true })
  })
})
