import { describe, expect, test } from "vitest"
import { defaultTuiKeybinds, inputBindings, matchesKeybind, resolveTuiKeybinds } from "../src/tui/keybinds.js"

describe("TUI keybind helpers", () => {
  test("normalizes common Ink key events", () => {
    expect(inputBindings("", { upArrow: true })).toContain("up")
    expect(inputBindings(" ", {})).toContain("space")
    expect(inputBindings("x", { ctrl: true })).toEqual(expect.arrayContaining(["x", "ctrl+x"]))
    expect(inputBindings("", { return: true })).toEqual(expect.arrayContaining(["return", "enter"]))
  })

  test("matches default navigation bindings", () => {
    expect(matchesKeybind("up", "", { upArrow: true })).toBe(true)
    expect(matchesKeybind("confirm", "", { return: true })).toBe(true)
    expect(matchesKeybind("cancel", "q", { ctrl: true })).toBe(true)
    expect(matchesKeybind("restore", "r", {})).toBe(true)
  })

  test("applies validated user overrides without losing defaults", () => {
    const keybinds = resolveTuiKeybinds({
      quit: "ctrl+k",
      toggleAll: ["shift+a", "ctrl+a"],
      save: [],
      unknown: "ignored",
    })

    expect(keybinds.quit).toEqual(["ctrl+k"])
    expect(keybinds.toggleAll).toEqual(["shift+a", "ctrl+a"])
    expect(keybinds.save).toEqual(defaultTuiKeybinds.save)
    expect(keybinds.confirm).toEqual(defaultTuiKeybinds.confirm)
  })
})
