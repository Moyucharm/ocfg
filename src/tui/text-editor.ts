export type TextCursor = {
  line: number
  column: number
}

export type TextEditResult = {
  value: string
  cursor: TextCursor
}

function linesForValue(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")
}

function lineLength(line: string) {
  return Array.from(line).length
}

function sliceLine(line: string, start: number, end?: number) {
  return Array.from(line).slice(start, end).join("")
}

function replaceLinePart(line: string, start: number, end: number, replacement: string) {
  return `${sliceLine(line, 0, start)}${replacement}${sliceLine(line, end)}`
}

function valueFromLines(lines: string[]) {
  return lines.join("\n")
}

export function normalizeCursor(value: string, cursor: TextCursor): TextCursor {
  const lines = linesForValue(value)
  const line = Math.max(0, Math.min(cursor.line, lines.length - 1))
  const column = Math.max(0, Math.min(cursor.column, lineLength(lines[line] ?? "")))
  return { line, column }
}

export function cursorAtEnd(value: string): TextCursor {
  const lines = linesForValue(value)
  const line = Math.max(0, lines.length - 1)
  return { line, column: lineLength(lines[line] ?? "") }
}

export function moveCursor(value: string, cursor: TextCursor, direction: "left" | "right" | "up" | "down"): TextCursor {
  const lines = linesForValue(value)
  const current = normalizeCursor(value, cursor)
  const currentLine = lines[current.line] ?? ""

  if (direction === "left") {
    if (current.column > 0) return { ...current, column: current.column - 1 }
    if (current.line === 0) return current
    const previousLine = lines[current.line - 1] ?? ""
    return { line: current.line - 1, column: lineLength(previousLine) }
  }

  if (direction === "right") {
    if (current.column < lineLength(currentLine)) return { ...current, column: current.column + 1 }
    if (current.line >= lines.length - 1) return current
    return { line: current.line + 1, column: 0 }
  }

  if (direction === "up") {
    if (current.line === 0) return current
    const targetLine = lines[current.line - 1] ?? ""
    return { line: current.line - 1, column: Math.min(current.column, lineLength(targetLine)) }
  }

  if (current.line >= lines.length - 1) return current
  const targetLine = lines[current.line + 1] ?? ""
  return { line: current.line + 1, column: Math.min(current.column, lineLength(targetLine)) }
}

export function insertText(value: string, cursor: TextCursor, text: string): TextEditResult {
  const lines = linesForValue(value)
  const current = normalizeCursor(value, cursor)
  const currentLine = lines[current.line] ?? ""
  const normalizedText = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  const insertedLines = normalizedText.split("\n")

  if (insertedLines.length === 1) {
    lines[current.line] = replaceLinePart(currentLine, current.column, current.column, normalizedText)
    return {
      value: valueFromLines(lines),
      cursor: { line: current.line, column: current.column + lineLength(normalizedText) },
    }
  }

  const before = sliceLine(currentLine, 0, current.column)
  const after = sliceLine(currentLine, current.column)
  const replacement = [
    `${before}${insertedLines[0] ?? ""}`,
    ...insertedLines.slice(1, -1),
    `${insertedLines.at(-1) ?? ""}${after}`,
  ]
  lines.splice(current.line, 1, ...replacement)
  return {
    value: valueFromLines(lines),
    cursor: {
      line: current.line + insertedLines.length - 1,
      column: lineLength(insertedLines.at(-1) ?? ""),
    },
  }
}

export function insertNewline(value: string, cursor: TextCursor): TextEditResult {
  return insertText(value, cursor, "\n")
}

export function deleteBackward(value: string, cursor: TextCursor): TextEditResult {
  const lines = linesForValue(value)
  const current = normalizeCursor(value, cursor)
  const currentLine = lines[current.line] ?? ""

  if (current.column > 0) {
    lines[current.line] = replaceLinePart(currentLine, current.column - 1, current.column, "")
    return {
      value: valueFromLines(lines),
      cursor: { line: current.line, column: current.column - 1 },
    }
  }

  if (current.line === 0) return { value, cursor: current }
  const previousLine = lines[current.line - 1] ?? ""
  lines[current.line - 1] = `${previousLine}${currentLine}`
  lines.splice(current.line, 1)
  return {
    value: valueFromLines(lines),
    cursor: { line: current.line - 1, column: lineLength(previousLine) },
  }
}

export function deleteForward(value: string, cursor: TextCursor): TextEditResult {
  const lines = linesForValue(value)
  const current = normalizeCursor(value, cursor)
  const currentLine = lines[current.line] ?? ""

  if (current.column < lineLength(currentLine)) {
    lines[current.line] = replaceLinePart(currentLine, current.column, current.column + 1, "")
    return { value: valueFromLines(lines), cursor: current }
  }

  if (current.line >= lines.length - 1) return { value, cursor: current }
  const nextLine = lines[current.line + 1] ?? ""
  lines[current.line] = `${currentLine}${nextLine}`
  lines.splice(current.line + 1, 1)
  return { value: valueFromLines(lines), cursor: current }
}
