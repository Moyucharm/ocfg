import React, { useEffect, useState, type ReactNode } from "react"
import { Box, Text, useStdout } from "ink"
import { useTuiText } from "./i18n.js"
import type { TuiDiffStyle } from "./preferences.js"
import { useTuiTheme, type TuiTheme } from "./theme.js"
import { cursorAtEnd, normalizeCursor, type TextCursor } from "./text-editor.js"

export const openCodeContentWidth = 78

export type OpenCodeMenuItem = {
  id: string
  label: string
  description?: string
  meta?: string
  detail?: string
  marker?: string
  tone?: "success" | "danger" | "muted"
  selected?: boolean
  backgroundColor?: string
  disabled?: boolean
  danger?: boolean
}

export type OpenCodeMenuGroup = {
  title: string
  items: OpenCodeMenuItem[]
}

export type OpenCodeMenuRow =
  | { kind: "section"; title: string }
  | { kind: "item"; item: OpenCodeMenuItem; itemIndex: number }

export const openCodeMenuLayout = {
  titleRow: 1,
  searchRow: 3,
  firstContentRow: 3,
  firstContentRowWithSearch: 5,
}

export type OpenCodeMenuViewportRow = {
  row: OpenCodeMenuRow
  rowIndex: number
  hasTopMargin: boolean
}

function matchesMenuQuery(item: OpenCodeMenuItem, query: string) {
  if (!query.trim()) return true
  const normalized = query.trim().toLowerCase()
  return [item.label, item.description, item.meta, item.detail].some((value) => value?.toLowerCase().includes(normalized))
}

export function openCodeMenuRows(groups: OpenCodeMenuGroup[], query: string): OpenCodeMenuRow[] {
  const rows: OpenCodeMenuRow[] = []
  let itemIndex = 0
  for (const group of groups) {
    const items = group.items.filter((item) => matchesMenuQuery(item, query))
    if (items.length === 0) continue
    rows.push({ kind: "section", title: group.title })
    for (const item of items) rows.push({ kind: "item", item, itemIndex: itemIndex++ })
  }
  return rows
}

export function centeredFramePadding(columns: number | undefined, contentWidth = openCodeContentWidth) {
  if (!columns || columns <= contentWidth) return 0
  return Math.floor((columns - contentWidth) / 2)
}

export function terminalContentWidth(columns: number | undefined, maxWidth = openCodeContentWidth) {
  return Math.max(1, Math.min(maxWidth, columns ?? maxWidth))
}

function terminalHeight(rows: number | undefined) {
  return Math.max(1, rows ?? process.stdout.rows ?? 24)
}

export function openCodeMenuContentHeight(options?: { showSearch?: boolean; hasFooter?: boolean; hasDetail?: boolean; terminalRows?: number }) {
  const chromeRows = 2 + (options?.showSearch ? 2 : 0) + (options?.hasDetail ? 2 : 0) + (options?.hasFooter ? 2 : 0)
  return Math.max(1, terminalHeight(options?.terminalRows) - chromeRows)
}

function menuViewportFromStart(rows: OpenCodeMenuRow[], startIndex: number, maxHeight: number) {
  const viewportRows: OpenCodeMenuViewportRow[] = []
  let height = 0

  for (let rowIndex = startIndex; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex]!
    const hasTopMargin = row.kind === "section" && rowIndex > 0 && viewportRows.length > 0
    const rowHeight = hasTopMargin ? 2 : 1
    if (viewportRows.length > 0 && height + rowHeight > maxHeight) break
    viewportRows.push({ row, rowIndex, hasTopMargin })
    height += rowHeight
    if (height >= maxHeight) break
  }

  return viewportRows
}

export function openCodeMenuViewport(rows: OpenCodeMenuRow[], selectedIndex: number, maxHeight: number) {
  const safeMaxHeight = Math.max(1, Math.floor(maxHeight))
  if (rows.length === 0) {
    return { rows: [] as OpenCodeMenuViewportRow[], hiddenBefore: false, hiddenAfter: false, maxHeight: safeMaxHeight }
  }

  const selectedRowIndex = Math.max(0, rows.findIndex((row) => row.kind === "item" && row.itemIndex === selectedIndex))
  let startIndex = 0
  let viewportRows = menuViewportFromStart(rows, startIndex, safeMaxHeight)

  if (!viewportRows.some((entry) => entry.rowIndex === selectedRowIndex)) {
    startIndex = selectedRowIndex
    while (startIndex > 0) {
      const candidate = menuViewportFromStart(rows, startIndex - 1, safeMaxHeight)
      if (!candidate.some((entry) => entry.rowIndex === selectedRowIndex)) break
      startIndex -= 1
      viewportRows = candidate
    }
    viewportRows = menuViewportFromStart(rows, startIndex, safeMaxHeight)
  }

  const firstRowIndex = viewportRows[0]?.rowIndex ?? 0
  const lastRowIndex = viewportRows.at(-1)?.rowIndex ?? rows.length - 1
  return {
    rows: viewportRows,
    hiddenBefore: firstRowIndex > 0,
    hiddenAfter: lastRowIndex < rows.length - 1,
    maxHeight: safeMaxHeight,
  }
}

function isCombiningCodePoint(codePoint: number) {
  return (
    (codePoint >= 0x0300 && codePoint <= 0x036f) ||
    (codePoint >= 0x1ab0 && codePoint <= 0x1aff) ||
    (codePoint >= 0x1dc0 && codePoint <= 0x1dff) ||
    (codePoint >= 0x20d0 && codePoint <= 0x20ff) ||
    (codePoint >= 0xfe20 && codePoint <= 0xfe2f)
  )
}

function isWideCodePoint(codePoint: number) {
  return (
    codePoint >= 0x1100 && (
      codePoint <= 0x115f ||
      codePoint === 0x2329 ||
      codePoint === 0x232a ||
      (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
      (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
      (codePoint >= 0xff00 && codePoint <= 0xff60) ||
      (codePoint >= 0xffe0 && codePoint <= 0xffe6)
    )
  )
}

function cellWidthForChar(char: string) {
  const codePoint = char.codePointAt(0) ?? 0
  if (codePoint === 0) return 0
  if (codePoint < 32 || (codePoint >= 0x7f && codePoint < 0xa0)) return 0
  if (isCombiningCodePoint(codePoint)) return 0
  return isWideCodePoint(codePoint) ? 2 : 1
}

export function textCellWidth(text: string) {
  return Array.from(text).reduce((width, char) => width + cellWidthForChar(char), 0)
}

function padCells(text: string, width: number) {
  const padding = width - textCellWidth(text)
  return padding > 0 ? `${text}${" ".repeat(padding)}` : text
}

function truncateCells(text: string, width: number) {
  if (width <= 0) return ""
  if (textCellWidth(text) <= width) return text
  if (width <= 3) {
    let result = ""
    let used = 0
    for (const char of Array.from(text)) {
      const charWidth = cellWidthForChar(char)
      if (used + charWidth > width) break
      result += char
      used += charWidth
    }
    return padCells(result, width)
  }

  const targetWidth = width - 3
  let result = ""
  let used = 0
  for (const char of Array.from(text)) {
    const charWidth = cellWidthForChar(char)
    if (used + charWidth > targetWidth) break
    result += char
    used += charWidth
  }
  return `${padCells(result, targetWidth)}...`
}

function truncateLine(text: string, width: number) {
  return truncateCells(text, width)
}

export type OpenCodeTextAreaRow = {
  lineIndex: number
  startColumn: number
  endColumn: number
  text: string
}

export function openCodeTextAreaRows(value: string, width: number): OpenCodeTextAreaRow[] {
  const safeWidth = Math.max(1, width)
  const rows: OpenCodeTextAreaRow[] = []
  const lines = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")

  lines.forEach((line, lineIndex) => {
    const chars = Array.from(line)
    if (chars.length === 0) {
      rows.push({ lineIndex, startColumn: 0, endColumn: 0, text: "" })
      return
    }

    let startColumn = 0
    let current = ""
    let currentWidth = 0
    chars.forEach((char, column) => {
      const charWidth = cellWidthForChar(char)
      if (current && currentWidth + charWidth > safeWidth) {
        rows.push({ lineIndex, startColumn, endColumn: column, text: current })
        startColumn = column
        current = char
        currentWidth = charWidth
        return
      }
      current += char
      currentWidth += charWidth
    })

    rows.push({ lineIndex, startColumn, endColumn: chars.length, text: current })
  })

  return rows
}

export function openCodeTextAreaViewport(value: string, cursor: TextCursor, width: number, maxRows: number) {
  const safeMaxRows = Math.max(1, maxRows)
  const normalizedCursor = normalizeCursor(value, cursor)
  const rows = openCodeTextAreaRows(value, width)
  let cursorRowIndex = rows.findIndex((row) => (
    row.lineIndex === normalizedCursor.line &&
    normalizedCursor.column >= row.startColumn &&
    normalizedCursor.column <= row.endColumn
  ))
  if (cursorRowIndex === -1) cursorRowIndex = Math.max(0, rows.length - 1)

  const start = Math.max(0, Math.min(cursorRowIndex - safeMaxRows + 1, Math.max(0, rows.length - safeMaxRows)))
  const visibleRows = rows.slice(start, start + safeMaxRows)
  return {
    rows: visibleRows,
    cursor,
    cursorRowIndex: cursorRowIndex - start,
    hiddenBefore: start > 0,
    hiddenAfter: start + safeMaxRows < rows.length,
  }
}

export function formatOpenCodeTitle(title: string) {
  return title.startsWith("OCfg") ? title : `OCfg - ${title}`
}

function menuLabelText(item: OpenCodeMenuItem) {
  return `${item.marker ? `${item.marker} ` : ""}${item.label}`
}

function menuLabelColumnWidth(rows: OpenCodeMenuRow[], width: number) {
  const labelWidths = rows.flatMap((row) => row.kind === "item" && row.item.description ? [textCellWidth(menuLabelText(row.item))] : [])
  if (labelWidths.length === 0) return undefined
  return Math.min(Math.max(...labelWidths), Math.max(1, Math.floor(width * 0.55)))
}

export function formatMenuLine(item: OpenCodeMenuItem, options?: { width?: number; labelColumnWidth?: number }) {
  const width = Math.max(1, options?.width ?? openCodeContentWidth)
  const label = menuLabelText(item)
  const right = item.meta
  if (right && width <= 3) return truncateCells(right, width)
  const rightWidth = right ? Math.min(textCellWidth(right), Math.max(1, width - 3)) : 0
  const rightText = right ? truncateCells(right, rightWidth) : ""
  const leftWidth = right ? Math.max(1, width - rightWidth - 2) : width

  let leftText: string
  if (item.description) {
    const labelWidth = Math.min(options?.labelColumnWidth ?? textCellWidth(label), leftWidth)
    const descriptionWidth = leftWidth - labelWidth - 1
    if (descriptionWidth > 0) {
      leftText = `${padCells(truncateCells(label, labelWidth), labelWidth)} ${truncateCells(item.description, descriptionWidth)}`
    } else {
      leftText = truncateCells(label, leftWidth)
    }
  } else {
    leftText = truncateCells(label, leftWidth)
  }

  if (!right) return padCells(leftText, width)
  return `${padCells(leftText, leftWidth)}  ${rightText}`
}

export function maskSecret(value: string) {
  if (!value) return ""
  if (value.length <= 4) return "*".repeat(value.length)
  if (value.length <= 10) return `${value.slice(0, 2)}...${value.slice(-2)}`
  return `${value.slice(0, 4)}...${value.slice(-4)}`
}

export function openCodeMenuItemColor(item: OpenCodeMenuItem, theme: TuiTheme) {
  if (item.selected) return theme.colors.highlightText
  if (item.disabled || item.tone === "muted") return theme.colors.muted
  if (item.tone === "success") return theme.colors.success
  if (item.tone === "danger" || item.danger) return theme.colors.error
  return theme.colors.primary
}

export function OpenCodeFrame(props: { children: ReactNode }) {
  const { stdout } = useStdout()
  const terminalWidth = Math.max(1, stdout.columns ?? openCodeContentWidth)
  const contentWidth = terminalContentWidth(terminalWidth)
  return (
    <Box width={terminalWidth} paddingLeft={centeredFramePadding(terminalWidth)}>
      <Box flexDirection="column" width={contentWidth}>
        {props.children}
      </Box>
    </Box>
  )
}

export function useDelayedLoading(loading: boolean, delayMs = 150) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!loading) {
      setVisible(false)
      return
    }
    const timer = setTimeout(() => setVisible(true), delayMs)
    return () => clearTimeout(timer)
  }, [delayMs, loading])

  return loading && visible
}

export function OpenCodeActionLine(props: { item: OpenCodeMenuItem; selected: boolean; width?: number; labelColumnWidth?: number }) {
  const theme = useTuiTheme()
  const backgroundColor = props.selected ? theme.colors.highlight : props.item.selected ? theme.colors.selected : props.item.backgroundColor
  return (
    <Text
      wrap="truncate"
      backgroundColor={backgroundColor}
      color={props.selected ? theme.colors.highlightText : openCodeMenuItemColor(props.item, theme)}
      bold={props.selected || props.item.selected}
    >
      {formatMenuLine(props.item, { width: props.width ?? openCodeContentWidth, labelColumnWidth: props.labelColumnWidth })}
    </Text>
  )
}

export function OpenCodeMenu(props: {
  title: string
  query: string
  rows: OpenCodeMenuRow[]
  selectedIndex: number
  showSearch?: boolean
  queryCursor?: TextCursor
  footer?: string[]
  footerRight?: ReactNode
  emptyText?: string
}) {
  const theme = useTuiTheme()
  const t = useTuiText()
  const { stdout } = useStdout()
  const [searchCursorVisible, setSearchCursorVisible] = useState(true)
  const contentWidth = terminalContentWidth(stdout.columns)
  const showSearch = props.showSearch === true
  const searchCursor = normalizeCursor(props.query, props.queryCursor ?? cursorAtEnd(props.query))
  const queryChars = Array.from(props.query)
  const queryCursorOffset = Math.max(0, Math.min(queryChars.length, searchCursor.column))
  const queryBefore = queryChars.slice(0, queryCursorOffset).join("")
  const queryCursorChar = queryChars[queryCursorOffset]
  const queryAfter = queryChars.slice(queryCursorOffset + (queryCursorChar ? 1 : 0)).join("")
  const selectedRow = props.rows.find((row) => row.kind === "item" && row.itemIndex === props.selectedIndex)
  const selectedDetail = selectedRow?.kind === "item" ? selectedRow.item.detail : undefined
  const hasFooter = Boolean(props.footer?.length || props.footerRight)
  const viewport = openCodeMenuViewport(
    props.rows,
    props.selectedIndex,
    openCodeMenuContentHeight({ showSearch, hasFooter, hasDetail: Boolean(selectedDetail), terminalRows: stdout.rows }),
  )
  const labelColumnWidth = menuLabelColumnWidth(props.rows, contentWidth)

  useEffect(() => {
    const timer = setInterval(() => setSearchCursorVisible((visible) => !visible), 550)
    return () => clearInterval(timer)
  }, [])

  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between" paddingX={5}>
        <Text bold>{formatOpenCodeTitle(props.title)}</Text>
        <Text color={theme.colors.shortcut}>esc</Text>
      </Box>
      <Text> </Text>
      {showSearch ? (
        <>
          <Box paddingX={5}>
            <Text>
              {props.query ? (
                <>
                  <Text color={theme.colors.primary}>{queryBefore}</Text>
                  <Text backgroundColor={searchCursorVisible ? theme.colors.highlight : undefined} color={searchCursorVisible ? theme.colors.highlightText : theme.colors.primary}>{queryCursorChar ?? " "}</Text>
                  <Text color={theme.colors.primary}>{queryAfter}</Text>
                </>
              ) : (
                <>
                  <Text backgroundColor={searchCursorVisible ? theme.colors.highlight : undefined} color={searchCursorVisible ? theme.colors.highlightText : theme.colors.primary}> </Text>
                  <Text color={theme.colors.muted}>{t("ui.search")}</Text>
                </>
              )}
            </Text>
          </Box>
          <Text> </Text>
        </>
      ) : null}
      {props.rows.length === 0 ? (
        <Box paddingX={5}>
          <Text color={theme.colors.muted}>{props.emptyText ?? t("ui.noMatches")}</Text>
        </Box>
      ) : null}
      {viewport.rows.map(({ row, rowIndex, hasTopMargin }) => {
        if (row.kind === "section") {
          return (
            <Box key={`${row.title}-${rowIndex}`} paddingX={5} marginTop={hasTopMargin ? 1 : 0}>
              <Text bold color={theme.colors.section}>{row.title}</Text>
            </Box>
          )
        }
        const selected = row.itemIndex === props.selectedIndex
        return <OpenCodeActionLine key={row.item.id} item={row.item} selected={selected} width={contentWidth} labelColumnWidth={labelColumnWidth} />
      })}
      {selectedDetail ? (
        <>
          <Text> </Text>
          <Box paddingX={5}>
            <Text color={theme.colors.muted} wrap="wrap">{selectedDetail}</Text>
          </Box>
        </>
      ) : null}
      {hasFooter ? (
        <>
          <Text> </Text>
          <Box paddingX={5} justifyContent="space-between">
            <Box gap={3}>
              {(props.footer ?? []).map((item, index) => {
                const [label, shortcut] = item.split("\t")
                return (
                  <Text key={`${item}-${index}`} bold>
                    {label}{shortcut ? <Text color={theme.colors.shortcut}> {shortcut}</Text> : null}
                  </Text>
                )
              })}
            </Box>
            {props.footerRight ? <Box>{props.footerRight}</Box> : null}
          </Box>
        </>
      ) : null}
    </Box>
  )
}

export function OpenCodePrompt(props: {
  title: string
  label: string
  value: string
  cursor?: TextCursor
  masked?: boolean
  error?: string
  hint?: string
  footer?: string[]
}) {
  const theme = useTuiTheme()
  const t = useTuiText()
  const [cursorVisible, setCursorVisible] = useState(true)
  const cursor = normalizeCursor(props.value, props.cursor ?? cursorAtEnd(props.value))
  const displayValue = props.masked ? "*".repeat(Array.from(props.value).length) : props.value
  const chars = Array.from(displayValue)
  const cursorOffset = Math.max(0, Math.min(chars.length, cursor.column))
  const before = chars.slice(0, cursorOffset).join("")
  const cursorChar = chars[cursorOffset]
  const after = chars.slice(cursorOffset + (cursorChar ? 1 : 0)).join("")

  useEffect(() => {
    const timer = setInterval(() => setCursorVisible((visible) => !visible), 550)
    return () => clearInterval(timer)
  }, [])

  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between" paddingX={5}>
        <Text bold>{formatOpenCodeTitle(props.title)}</Text>
        <Text color={theme.colors.shortcut}>esc</Text>
      </Box>
      <Text> </Text>
      <Box paddingX={5}>
        <Text color={theme.colors.section} bold>{props.label}</Text>
      </Box>
      <Box paddingX={5}>
        <Text>
          <Text wrap="wrap">{before}</Text>
          <Text backgroundColor={cursorVisible ? theme.colors.highlight : undefined} color={cursorVisible ? theme.colors.highlightText : theme.colors.primary}>{cursorChar ?? " "}</Text>
          <Text wrap="wrap">{after}</Text>
        </Text>
      </Box>
      {props.hint ? <Box paddingX={5}><Text color={theme.colors.muted}>{props.hint}</Text></Box> : null}
      {props.error ? <Box paddingX={5}><Text color={theme.colors.error}>{props.error}</Text></Box> : null}
      <Text> </Text>
      <Box paddingX={5} gap={3}>
        {(props.footer ?? [`${t("common.save")}\tenter`, `${t("common.cancel")}\tesc`]).map((item, index) => {
          const [label, shortcut] = item.split("\t")
          return (
            <Text key={`${item}-${index}`} bold>
              {label}{shortcut ? <Text color={theme.colors.shortcut}> {shortcut}</Text> : null}
            </Text>
          )
        })}
      </Box>
    </Box>
  )
}

export function OpenCodeTextArea(props: {
  title: string
  label: string
  value: string
  cursor?: TextCursor
  error?: string
  hint?: string
  footer?: string[]
}) {
  const theme = useTuiTheme()
  const t = useTuiText()
  const { stdout } = useStdout()
  const [cursorVisible, setCursorVisible] = useState(true)
  const contentWidth = Math.max(1, terminalContentWidth(stdout.columns) - 10)
  const maxLines = Math.max(4, (stdout.rows ?? 24) - 10)
  const cursor = normalizeCursor(props.value, props.cursor ?? cursorAtEnd(props.value))
  const viewport = openCodeTextAreaViewport(props.value, cursor, contentWidth, maxLines)

  useEffect(() => {
    const timer = setInterval(() => setCursorVisible((visible) => !visible), 550)
    return () => clearInterval(timer)
  }, [])

  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between" paddingX={5}>
        <Text bold>{formatOpenCodeTitle(props.title)}</Text>
        <Text color={theme.colors.shortcut}>esc</Text>
      </Box>
      <Text> </Text>
      <Box paddingX={5}>
        <Text color={theme.colors.section} bold>{props.label}</Text>
      </Box>
      {viewport.hiddenBefore ? <Box paddingX={5}><Text color={theme.colors.muted}>...</Text></Box> : null}
      {viewport.rows.map((row, index) => {
        const hasCursor = index === viewport.cursorRowIndex
        const cursorOffset = hasCursor ? Math.max(0, Math.min(Array.from(row.text).length, cursor.column - row.startColumn)) : -1
        const chars = Array.from(row.text)
        const before = hasCursor ? chars.slice(0, cursorOffset).join("") : row.text
        const cursorChar = hasCursor ? chars[cursorOffset] : undefined
        const after = hasCursor ? chars.slice(cursorOffset + (cursorChar ? 1 : 0)).join("") : ""
        return (
          <Box key={`${row.lineIndex}-${row.startColumn}-${index}`} paddingX={5}>
            <Text wrap="truncate">
              {before || (!hasCursor && !row.text ? " " : "")}
              {hasCursor ? (
                <Text backgroundColor={cursorVisible ? theme.colors.highlight : undefined} color={cursorVisible ? theme.colors.highlightText : theme.colors.primary}>
                  {cursorChar ?? " "}
                </Text>
              ) : null}
              {after}
            </Text>
          </Box>
        )
      })}
      {viewport.hiddenAfter ? <Box paddingX={5}><Text color={theme.colors.muted}>...</Text></Box> : null}
      {props.hint ? <Box paddingX={5}><Text color={theme.colors.muted}>{props.hint}</Text></Box> : null}
      {props.error ? <Box paddingX={5}><Text color={theme.colors.error}>{props.error}</Text></Box> : null}
      <Text> </Text>
      <Box paddingX={5} gap={3}>
        {(props.footer ?? [`${t("common.save")}\tctrl+x`, `${t("common.cancel")}\tesc`]).map((item, index) => {
          const [label, shortcut] = item.split("\t")
          return (
            <Text key={`${item}-${index}`} bold>
              {label}{shortcut ? <Text color={theme.colors.shortcut}> {shortcut}</Text> : null}
            </Text>
          )
        })}
      </Box>
    </Box>
  )
}

export function OpenCodeNotice(props: { children: ReactNode; tone?: "warning" | "error" | "success" }) {
  const theme = useTuiTheme()
  const color = props.tone === "error" ? theme.colors.error : props.tone === "success" ? theme.colors.success : theme.colors.warning
  return (
    <Box paddingX={5}>
      <Text color={color}>{props.children}</Text>
    </Box>
  )
}

export function OpenCodeBusyDialog(props: { message: string }) {
  const theme = useTuiTheme()
  const t = useTuiText()
  const { stdout } = useStdout()
  const contentWidth = terminalContentWidth(stdout.columns)
  const dialogWidth = Math.max(1, Math.min(contentWidth, Math.max(24, contentWidth - 10), 42))
  return (
    <Box width={contentWidth} height={Math.max(1, stdout.rows ?? 24)} justifyContent="center" alignItems="center">
      <Box width={dialogWidth} flexDirection="column" borderStyle="round" borderColor={theme.colors.highlight} paddingX={2} paddingY={1}>
        <Text bold color={theme.colors.section}>{t("common.saving")}</Text>
        {props.message !== t("common.saving") ? <Text color={theme.colors.primary}>{props.message}</Text> : null}
      </Box>
    </Box>
  )
}

function diffLineColor(line: string, diffStyle: TuiDiffStyle) {
  if (diffStyle === "compact" && line.startsWith(" ")) return "gray"
  if (line.startsWith("@@")) return "meta"
  if (line.startsWith("+++") || line.startsWith("---")) return "meta"
  if (line.startsWith("+")) return "add"
  if (line.startsWith("-")) return "remove"
  return undefined
}

export function DiffBlock(props: { diff: string; style: TuiDiffStyle; offset?: number; maxLines?: number }) {
  const theme = useTuiTheme()
  const t = useTuiText()
  const { stdout } = useStdout()
  const contentWidth = Math.max(1, terminalContentWidth(stdout.columns) - 10)
  const lines = props.diff ? props.diff.split(/\r?\n/) : [t("diff.noChanges")]
  const offset = Math.max(0, Math.min(props.offset ?? 0, Math.max(0, lines.length - 1)))
  const visibleLines = props.maxLines === undefined ? lines : lines.slice(offset, offset + Math.max(1, props.maxLines))
  return (
    <Box flexDirection="column" paddingX={5}>
      {visibleLines.map((line, index) => {
        const colorKind = diffLineColor(line, props.style)
        const color = colorKind === "add" ? theme.colors.diffAdd : colorKind === "remove" ? theme.colors.diffRemove : colorKind === "meta" ? theme.colors.diffMeta : undefined
        return <Text key={`${offset + index}-${line}`} color={color} dimColor={props.style === "compact" && line.startsWith(" ")} wrap="truncate">{truncateLine(line || " ", contentWidth)}</Text>
      })}
    </Box>
  )
}
