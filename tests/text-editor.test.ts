import { describe, expect, test } from "vitest"
import { deleteEditableTextInputBackward, deleteEditableTextInputForward, editableTextInput, insertEditableTextInput, isBackwardDeleteInput, isForwardDeleteInput, moveEditableTextInput } from "../src/tui/input.js"
import { deleteBackward, deleteForward, insertNewline, insertText, moveCursor } from "../src/tui/text-editor.js"
import { openCodeTextAreaRows, openCodeTextAreaViewport } from "../src/tui/ui.js"

describe("TUI text editor", () => {
  test("inserts and deletes text at the cursor", () => {
    const inserted = insertText("hello world", { line: 0, column: 5 }, ",")
    expect(inserted).toEqual({ value: "hello, world", cursor: { line: 0, column: 6 } })

    const newline = insertNewline(inserted.value, inserted.cursor)
    expect(newline).toEqual({ value: "hello,\n world", cursor: { line: 1, column: 0 } })

    expect(deleteBackward(newline.value, newline.cursor)).toEqual({ value: "hello, world", cursor: { line: 0, column: 6 } })
    expect(deleteForward("ab\ncd", { line: 0, column: 2 })).toEqual({ value: "abcd", cursor: { line: 0, column: 2 } })
  })

  test("moves cursor across lines", () => {
    const value = "abc\nde\nfghi"

    expect(moveCursor(value, { line: 1, column: 1 }, "up")).toEqual({ line: 0, column: 1 })
    expect(moveCursor(value, { line: 1, column: 1 }, "down")).toEqual({ line: 2, column: 1 })
    expect(moveCursor(value, { line: 1, column: 0 }, "left")).toEqual({ line: 0, column: 3 })
    expect(moveCursor(value, { line: 1, column: 2 }, "right")).toEqual({ line: 2, column: 0 })
  })

  test("wraps long lines and keeps cursor visible", () => {
    const rows = openCodeTextAreaRows("abcdef\n短句", 3)

    expect(rows.map((row) => row.text)).toEqual(["abc", "def", "短", "句"])

    const viewport = openCodeTextAreaViewport("abcdef\nghijkl", { line: 1, column: 5 }, 3, 2)
    expect(viewport.rows.map((row) => row.text)).toEqual(["ghi", "jkl"])
    expect(viewport.cursorRowIndex).toBe(1)
    expect(viewport.hiddenBefore).toBe(true)
  })

  test("edits single-line prompt input at the cursor", () => {
    const initial = editableTextInput("helo")
    const moved = moveEditableTextInput(initial, "left")
    const inserted = insertEditableTextInput(moved, "l")

    expect(inserted).toEqual({ value: "hello", cursor: { line: 0, column: 4 } })
    expect(deleteEditableTextInputBackward(inserted)).toEqual({ value: "helo", cursor: { line: 0, column: 3 } })
    expect(deleteEditableTextInputForward({ value: "hello", cursor: { line: 0, column: 3 } })).toEqual({ value: "helo", cursor: { line: 0, column: 3 } })
  })

  test("treats terminal DEL as backspace, not forward delete", () => {
    expect(isBackwardDeleteInput("", { delete: true })).toBe(true)
    expect(isBackwardDeleteInput("\x7f", { delete: true })).toBe(true)
    expect(isForwardDeleteInput("\x7f", { delete: true })).toBe(false)
    expect(isForwardDeleteInput("", { delete: true })).toBe(false)
    expect(isBackwardDeleteInput("\x1B[3~", { delete: true })).toBe(false)
    expect(isForwardDeleteInput("\x1B[3~", { delete: true })).toBe(true)
    expect(isForwardDeleteInput("[3~", { delete: true })).toBe(true)
  })
})
