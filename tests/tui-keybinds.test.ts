import { describe, expect, test } from "vitest"
import { defaultTuiKeybinds, inputBindings, matchesKeybind, resolveTuiKeybinds } from "../src/tui/keybinds.js"

describe("TUI keybind helpers", () => {
  test("normalizes common Ink key events", () => {
    expect(inputBindings("", { upArrow: true })).toContain("up")
    expect(inputBindings(" ", {})).toContain("space")
    expect(inputBindings("p", { ctrl: true })).toEqual(expect.arrayContaining(["p", "ctrl+p"]))
    expect(inputBindings("", { return: true })).toEqual(expect.arrayContaining(["return", "enter"]))
  })

  test("matches default command palette and navigation bindings", () => {
    expect(matchesKeybind("commandPalette", "p", { ctrl: true })).toBe(true)
    expect(matchesKeybind("up", "", { upArrow: true })).toBe(true)
    expect(matchesKeybind("confirm", "", { return: true })).toBe(true)
    expect(matchesKeybind("cancel", "q", { ctrl: true })).toBe(true)
  })

  test("applies validated user overrides without losing defaults", () => {
    const keybinds = resolveTuiKeybinds({
      commandPalette: "ctrl+k",
      toggleAll: ["shift+a", "ctrl+a"],
      save: [],
      unknown: "ignored",
    })

    expect(keybinds.commandPalette).toEqual(["ctrl+k"])
    expect(keybinds.toggleAll).toEqual(["shift+a", "ctrl+a"])
    expect(keybinds.save).toEqual(defaultTuiKeybinds.save)
    expect(keybinds.confirm).toEqual(defaultTuiKeybinds.confirm)
  })
})
