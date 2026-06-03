import { describe, expect, test } from "vitest"
import { resolveTuiTheme } from "../src/tui/theme.js"
import { centeredFramePadding, formatMenuLine, maskSecret, openCodeMenuItemColor, openCodeMenuRows, openCodeMenuViewport, textCellWidth, type OpenCodeMenuGroup } from "../src/tui/ui.js"

describe("TUI UI helpers", () => {
  test("keeps selected menu items inside a clipped viewport", () => {
    const groups: OpenCodeMenuGroup[] = [{
      title: "Models",
      items: Array.from({ length: 10 }, (_, index) => ({ id: `m${index}`, label: `model-${index}` })),
    }]
    const rows = openCodeMenuRows(groups, "")
    const viewport = openCodeMenuViewport(rows, 8, 4)
    const visibleItemIndexes = viewport.rows.flatMap((entry) => entry.row.kind === "item" ? [entry.row.itemIndex] : [])

    expect(viewport.hiddenBefore).toBe(true)
    expect(visibleItemIndexes).toContain(8)
    expect(visibleItemIndexes.length).toBeLessThanOrEqual(4)
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

  test("measures wide terminal cells for Chinese metadata", () => {
    expect(textCellWidth("已添加")).toBe(6)
    expect(formatMenuLine({ id: "existing", label: "gpt-oss-120b-medium", meta: "已添加" }, { width: 28 }).endsWith("已添加")).toBe(true)
  })

  test("keeps right metadata visible while aligning label and description columns", () => {
    const line = formatMenuLine(
      { id: "provider", label: "milki-gemini", description: "自用API-国模", meta: "5 models" },
      { width: 40, labelColumnWidth: 12 },
    )

    expect(line).toContain("milki-gemini 自用API-国模")
    expect(line.endsWith("5 models")).toBe(true)
    expect(textCellWidth(line)).toBe(40)
  })

  test("pads labels to a shared table column before descriptions", () => {
    const line = formatMenuLine({ id: "provider", label: "milki", description: "自用API", meta: "3 models" }, { width: 38, labelColumnWidth: 12 })

    expect(line.startsWith("milki        自用API")).toBe(true)
    expect(line.endsWith("3 models")).toBe(true)
  })

  test("maps menu item tones to theme colors", () => {
    const theme = resolveTuiTheme("opencode")

    expect(openCodeMenuItemColor({ id: "enable", label: "Enable", tone: "success" }, theme)).toBe(theme.colors.success)
    expect(openCodeMenuItemColor({ id: "disable", label: "Disable", tone: "danger" }, theme)).toBe(theme.colors.error)
    expect(openCodeMenuItemColor({ id: "legacy", label: "Delete", danger: true }, theme)).toBe(theme.colors.error)
    expect(openCodeMenuItemColor({ id: "selected", label: "Selected", selected: true }, theme)).toBe(theme.colors.highlightText)
  })
})
