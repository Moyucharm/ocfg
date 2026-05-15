import { describe, expect, test } from "vitest"
import { defaultTuiPreferences, resolveTuiPreferences } from "../src/tui/preferences.js"

describe("TUI preferences", () => {
  test("returns defaults for missing config", () => {
    const result = resolveTuiPreferences(undefined)

    expect(result.preferences).toBe(defaultTuiPreferences)
    expect(result.diagnostics).toEqual([])
  })

  test("accepts theme, diff style, mouse, and keybind overrides", () => {
    const result = resolveTuiPreferences({
      theme: "system",
      diffStyle: "compact",
      mouse: false,
      keybinds: { quit: "ctrl+k" },
    })

    expect(result.preferences.theme).toBe("system")
    expect(result.preferences.diffStyle).toBe("compact")
    expect(result.preferences.mouse).toBe(false)
    expect(result.preferences.keybinds.quit).toEqual(["ctrl+k"])
    expect(result.diagnostics).toEqual([])
  })

  test("reports invalid theme, diff style, and mouse while keeping safe defaults", () => {
    const result = resolveTuiPreferences({ theme: "neon", diffStyle: "side-by-side", mouse: "yes" })

    expect(result.preferences.theme).toBe(defaultTuiPreferences.theme)
    expect(result.preferences.diffStyle).toBe(defaultTuiPreferences.diffStyle)
    expect(result.preferences.mouse).toBe(defaultTuiPreferences.mouse)
    expect(result.diagnostics).toHaveLength(3)
  })
})
