import { useInput, useStdin } from "ink"
import { cursorAtEnd, deleteBackward, deleteForward, insertText, moveCursor, type TextCursor } from "./text-editor.js"

type InputHandler = Parameters<typeof useInput>[0]
type DeleteInputKey = { backspace?: boolean; delete?: boolean }
type MoveDirection = "left" | "right" | "up" | "down"

function removePasteMarkers(input: string) {
  return input.replace(/\x1B\[200~/g, "").replace(/\x1B\[201~/g, "")
}

export function printableInput(input: string) {
  const printable = removePasteMarkers(input).replace(/[\u0000-\u001F\u007F]/g, "")
  return printable.startsWith("[<") ? "" : printable
}

export function printableMultilineInput(input: string) {
  const normalized = removePasteMarkers(input).replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  const printable = normalized.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "")
  return printable.startsWith("[<") ? "" : printable
}

export function appendPrintableInput(value: string, input: string) {
  return `${value}${printableInput(input)}`
}

export function removeLastChar(value: string) {
  return Array.from(value).slice(0, -1).join("")
}

export type EditableTextInput = {
  value: string
  cursor: TextCursor
}

export function editableTextInput(value = ""): EditableTextInput {
  return { value, cursor: cursorAtEnd(value) }
}

export function moveEditableTextInput(current: EditableTextInput, direction: MoveDirection) {
  return { ...current, cursor: moveCursor(current.value, current.cursor, direction) }
}

export function insertEditableTextInput(current: EditableTextInput, input: string) {
  const printable = printableInput(input).replace(/[\r\n]/g, "")
  if (!printable) return current
  return insertText(current.value, current.cursor, printable)
}

export function insertMultilineTextInput(current: EditableTextInput, input: string) {
  const printable = printableMultilineInput(input)
  if (!printable) return current
  return insertText(current.value, current.cursor, printable)
}

export function deleteEditableTextInputBackward(current: EditableTextInput) {
  return deleteBackward(current.value, current.cursor)
}

export function deleteEditableTextInputForward(current: EditableTextInput) {
  return deleteForward(current.value, current.cursor)
}

function isExplicitForwardDeleteInput(input: string) {
  return input === "\x1B[3~" || input === "[3~"
}

export function isBackwardDeleteInput(input: string, key: DeleteInputKey) {
  return !isExplicitForwardDeleteInput(input) && (key.backspace === true || key.delete === true || input === "\b" || input === "\x7f" || input === "\x1B\b" || input === "\x1B\x7f")
}

export function isForwardDeleteInput(input: string, key: DeleteInputKey) {
  return isExplicitForwardDeleteInput(input) && !isBackwardDeleteInput(input, key)
}

export function useTuiInput(handler: InputHandler) {
  const { isRawModeSupported } = useStdin()
  useInput(handler, { isActive: isRawModeSupported === true })
}
