import { describe, expect, test } from "vitest"
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
    expect(() => buildExistingModelEditPatch({ limit: { context: 1, output: 2 } }, { output: -1 })).toThrow(ModelEditDraftError)
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
