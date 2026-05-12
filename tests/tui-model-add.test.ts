import { describe, expect, test } from "vitest"
import { configuredModelIDs, selectableDetectedModels, splitExistingModelIDs } from "../src/tui/model-add.js"

describe("model add helpers", () => {
  test("collects configured model ids from provider", () => {
    expect(Array.from(configuredModelIDs({ models: { a: {}, b: {} } })).sort()).toEqual(["a", "b"])
    expect(Array.from(configuredModelIDs({}))).toEqual([])
  })

  test("splits incoming model ids into new and already-added", () => {
    expect(splitExistingModelIDs(["a", "b", "c"], new Set(["a", "c"]))).toEqual({
      newModelIDs: ["b"],
      alreadyAdded: ["a", "c"],
    })
  })

  test("filters detected models down to selectable ids", () => {
    expect(selectableDetectedModels([
      { id: "existing", capabilitiesResolved: false },
      { id: "fresh", capabilitiesResolved: false, name: "Fresh" },
    ], new Set(["existing"]))).toEqual(["fresh"])
  })
})
