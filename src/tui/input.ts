import { useInput, useStdin } from "ink"
import { cursorAtEnd, deleteBackward, deleteForward, insertText, moveCursor, type TextCursor } from "./text-editor.js"

type InputHandler = Parameters<typeof useInput>[0]
type DeleteInputKey = { backspace?: boolean; delete?: boolean }

export function printableInput(input: string) {
  const printable = input.replace(/[\u0000-\u001F\u007F]/g, "")
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

export function moveEditableTextInput(current: EditableTextInput, direction: "left" | "right") {
  return { ...current, cursor: moveCursor(current.value, current.cursor, direction) }
}

export function insertEditableTextInput(current: EditableTextInput, input: string) {
  const printable = printableInput(input).replace(/[\r\n]/g, "")
  if (!printable) return current
  return insertText(current.value, current.cursor, printable)
}

export function deleteEditableTextInputBackward(current: EditableTextInput) {
  return deleteBackward(current.value, current.cursor)
}

export function deleteEditableTextInputForward(current: EditableTextInput) {
  return deleteForward(current.value, current.cursor)
}

export function isBackwardDeleteInput(input: string, key: DeleteInputKey) {
  return key.backspace === true || key.delete === true || input === "\b" || input === "\x7f" || input === "\x1B\b" || input === "\x1B\x7f"
}

export function isForwardDeleteInput(input: string, key: DeleteInputKey) {
  return (input === "\x1B[3~" || input === "[3~") && !isBackwardDeleteInput(input, key)
}

export function useTuiInput(handler: InputHandler) {
  const { isRawModeSupported } = useStdin()
  useInput(handler, { isActive: isRawModeSupported === true })
}
