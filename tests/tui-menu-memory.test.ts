import { describe, expect, test } from "vitest"
import { createRememberedOpenCodeMenuEntry, resolveRememberedOpenCodeMenuSelection } from "../src/tui/menu-memory.js"
import type { OpenCodeMenuGroup } from "../src/tui/ui.js"

describe("TUI menu memory", () => {
  test("restores a remembered item by id after the list order changes", () => {
    const originalGroups: OpenCodeMenuGroup[] = [{
      title: "Providers",
      items: [
        { id: "anthropic", label: "Anthropic" },
        { id: "openai", label: "OpenAI" },
        { id: "gemini", label: "Gemini" },
      ],
    }]
    const nextGroups: OpenCodeMenuGroup[] = [{
      title: "Providers",
      items: [
        { id: "openai", label: "OpenAI" },
        { id: "gemini", label: "Gemini" },
        { id: "anthropic", label: "Anthropic" },
      ],
    }]

    const entry = createRememberedOpenCodeMenuEntry({ groups: originalGroups, selectedIndex: 2 })

    expect(entry).toEqual({ selectedIndex: 2, selectedItemId: "gemini" })
    expect(resolveRememberedOpenCodeMenuSelection({ groups: nextGroups, entry })).toBe(1)
  })

  test("falls back to the remembered index when the item id no longer exists", () => {
    const groups: OpenCodeMenuGroup[] = [{
      title: "Providers",
      items: [
        { id: "openai", label: "OpenAI" },
        { id: "gemini", label: "Gemini" },
      ],
    }]

    expect(resolveRememberedOpenCodeMenuSelection({ groups, entry: { selectedIndex: 1, selectedItemId: "anthropic" } })).toBe(1)
  })

  test("clamps a remembered index when the list becomes shorter", () => {
    const groups: OpenCodeMenuGroup[] = [{
      title: "Plugins",
      items: [{ id: "install", label: "Install" }],
    }]

    expect(resolveRememberedOpenCodeMenuSelection({ groups, entry: { selectedIndex: 4 } })).toBe(0)
    expect(createRememberedOpenCodeMenuEntry({ groups, selectedIndex: 4 })).toEqual({ selectedIndex: 0, selectedItemId: "install" })
  })
})
