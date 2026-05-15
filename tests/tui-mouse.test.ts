import { describe, expect, test } from "vitest"
import { parseTuiMouseEvent } from "../src/tui/mouse.js"
import { centeredFramePadding, maskSecret, menuItemIndexFromMouse, openCodeMenuRows, type OpenCodeMenuGroup } from "../src/tui/ui.js"

describe("TUI mouse helpers", () => {
  test("parses SGR mouse click and wheel events", () => {
    expect(parseTuiMouseEvent("\u001B[<0;12;7M")).toEqual({ kind: "press", button: "left", x: 12, y: 7 })
    expect(parseTuiMouseEvent("[<0;12;7m")).toEqual({ kind: "release", button: "left", x: 12, y: 7 })
    expect(parseTuiMouseEvent("[<64;10;4M")).toEqual({ kind: "wheel", button: "wheel-up", x: 10, y: 4 })
    expect(parseTuiMouseEvent("[<65;10;4M")).toEqual({ kind: "wheel", button: "wheel-down", x: 10, y: 4 })
  })

  test("maps mouse rows to visible OpenCode menu items", () => {
    const groups: OpenCodeMenuGroup[] = [
      { title: "Commands", items: [{ id: "a", label: "Alpha" }] },
      { title: "Config", items: [{ id: "b", label: "Beta" }] },
    ]
    const rows = openCodeMenuRows(groups, "")

    expect(menuItemIndexFromMouse({ kind: "press", button: "left", x: 1, y: 4 }, rows)).toBe(0)
    expect(menuItemIndexFromMouse({ kind: "press", button: "left", x: 1, y: 7 }, rows)).toBe(1)
    expect(menuItemIndexFromMouse({ kind: "press", button: "left", x: 1, y: 6 }, rows, { showSearch: true })).toBe(0)
    expect(menuItemIndexFromMouse({ kind: "press", button: "left", x: 1, y: 9 }, rows, { showSearch: true })).toBe(1)
    expect(menuItemIndexFromMouse({ kind: "press", button: "right", x: 1, y: 4 }, rows)).toBeUndefined()
  })

  test("centers the fixed-width TUI frame when the terminal is wider", () => {
    expect(centeredFramePadding(undefined)).toBe(0)
    expect(centeredFramePadding(78)).toBe(0)
    expect(centeredFramePadding(100)).toBe(11)
    expect(centeredFramePadding(120)).toBe(21)
  })

  test("masks secrets to the head and tail only", () => {
    expect(maskSecret("sk-1234567890abcdef")).toBe("sk-1...cdef")
    expect(maskSecret("abcd1234")).toBe("ab...34")
    expect(maskSecret("abc")).toBe("***")
  })

  test("filters OpenCode menu rows by label and metadata", () => {
    const rows = openCodeMenuRows([{ title: "Config", items: [{ id: "model", label: "Select model", meta: "current" }] }], "current")

    expect(rows).toHaveLength(2)
    expect(rows[1]).toMatchObject({ kind: "item", itemIndex: 0 })
  })
})
