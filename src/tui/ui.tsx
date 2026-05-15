import React, { type ReactNode } from "react"
import { Box, Text, useStdout } from "ink"
import type { TuiDiffStyle } from "./preferences.js"
import { useTuiTheme } from "./theme.js"
import type { TuiMouseEvent } from "./mouse.js"

export const openCodeContentWidth = 78

export type OpenCodeMenuItem = {
  id: string
  label: string
  description?: string
  shortcut?: string
  marker?: string
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

function matchesMenuQuery(item: OpenCodeMenuItem, query: string) {
  if (!query.trim()) return true
  const normalized = query.trim().toLowerCase()
  return [item.label, item.description, item.shortcut].some((value) => value?.toLowerCase().includes(normalized))
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

export function menuItemIndexFromMouse(event: TuiMouseEvent, rows: OpenCodeMenuRow[], options?: { showSearch?: boolean }) {
  if (event.kind !== "press" || event.button !== "left") return undefined
  let visualRow = options?.showSearch ? openCodeMenuLayout.firstContentRowWithSearch : openCodeMenuLayout.firstContentRow
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index]
    if (row.kind === "section" && index > 0) visualRow += 1
    if (event.y === visualRow) return row.kind === "item" ? row.itemIndex : undefined
    visualRow += 1
  }
  return undefined
}

function padLine(text: string, width = openCodeContentWidth) {
  if (text.length >= width) return text
  return `${text}${" ".repeat(width - text.length)}`
}

export function OpenCodeFrame(props: { children: ReactNode }) {
  const { stdout } = useStdout()
  const terminalWidth = Math.max(1, stdout.columns ?? openCodeContentWidth)
  const contentWidth = Math.min(openCodeContentWidth, terminalWidth)
  return (
    <Box width={terminalWidth} paddingLeft={centeredFramePadding(terminalWidth)}>
      <Box flexDirection="column" width={contentWidth}>
        {props.children}
      </Box>
    </Box>
  )
}

export function OpenCodeActionLine(props: { item: OpenCodeMenuItem; selected: boolean }) {
  const theme = useTuiTheme()
  const left = `${props.item.marker ? `${props.item.marker} ` : ""}${props.item.label}${props.item.description ? ` ${props.item.description}` : ""}`
  const content = props.item.shortcut ? `${left}${" ".repeat(Math.max(1, 62 - left.length))}${props.item.shortcut}` : left
  return (
    <Text
      wrap="truncate"
      backgroundColor={props.selected ? theme.colors.highlight : undefined}
      color={props.selected ? theme.colors.highlightText : props.item.disabled ? theme.colors.muted : props.item.danger ? theme.colors.error : theme.colors.primary}
      bold={props.selected}
    >
      {padLine(content)}
    </Text>
  )
}

export function OpenCodeMenu(props: {
  title: string
  query: string
  rows: OpenCodeMenuRow[]
  selectedIndex: number
  showSearch?: boolean
  footer?: string[]
  emptyText?: string
}) {
  const theme = useTuiTheme()
  const showSearch = props.showSearch === true
  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between" paddingX={5}>
        <Text bold>{props.title}</Text>
        <Text color={theme.colors.shortcut}>esc</Text>
      </Box>
      <Text> </Text>
      {showSearch ? (
        <>
          <Box paddingX={5}>
            <Text>
              <Text backgroundColor={theme.colors.highlight} color={theme.colors.highlightText}>{props.query ? props.query[0] : "S"}</Text>
              <Text color={props.query ? theme.colors.primary : theme.colors.muted}>{props.query ? props.query.slice(1) : "earch"}</Text>
            </Text>
          </Box>
          <Text> </Text>
        </>
      ) : null}
      {props.rows.length === 0 ? (
        <Box paddingX={5}>
          <Text color={theme.colors.muted}>{props.emptyText ?? "No matches"}</Text>
        </Box>
      ) : null}
      {props.rows.map((row, index) => {
        if (row.kind === "section") {
          return (
            <Box key={`${row.title}-${index}`} paddingX={5} marginTop={index === 0 ? 0 : 1}>
              <Text bold color={theme.colors.section}>{row.title}</Text>
            </Box>
          )
        }
        const selected = row.itemIndex === props.selectedIndex
        return <OpenCodeActionLine key={row.item.id} item={row.item} selected={selected} />
      })}
      {props.footer && props.footer.length > 0 ? (
        <>
          <Text> </Text>
          <Box paddingX={5} gap={3}>
            {props.footer.map((item, index) => {
              const [label, shortcut] = item.split("\t")
              return (
                <Text key={`${item}-${index}`} bold>
                  {label}{shortcut ? <Text color={theme.colors.shortcut}> {shortcut}</Text> : null}
                </Text>
              )
            })}
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
  masked?: boolean
  error?: string
  hint?: string
  footer?: string[]
}) {
  const theme = useTuiTheme()
  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between" paddingX={5}>
        <Text bold>{props.title}</Text>
        <Text color={theme.colors.shortcut}>esc</Text>
      </Box>
      <Text> </Text>
      <Box paddingX={5}>
        <Text color={theme.colors.section} bold>{props.label}</Text>
      </Box>
      <Box paddingX={5}>
        <Text>
          <Text backgroundColor={theme.colors.highlight} color={theme.colors.highlightText}> </Text>
          <Text>{props.masked ? "*".repeat(props.value.length) : props.value || "_"}</Text>
        </Text>
      </Box>
      {props.hint ? <Box paddingX={5}><Text color={theme.colors.muted}>{props.hint}</Text></Box> : null}
      {props.error ? <Box paddingX={5}><Text color={theme.colors.error}>{props.error}</Text></Box> : null}
      <Text> </Text>
      <Box paddingX={5} gap={3}>
        {(props.footer ?? ["Save\tenter", "Cancel\tesc"]).map((item, index) => {
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

function diffLineColor(line: string, diffStyle: TuiDiffStyle) {
  if (diffStyle === "compact" && line.startsWith(" ")) return "gray"
  if (line.startsWith("@@")) return "meta"
  if (line.startsWith("+++") || line.startsWith("---")) return "meta"
  if (line.startsWith("+")) return "add"
  if (line.startsWith("-")) return "remove"
  return undefined
}

export function DiffBlock(props: { diff: string; style: TuiDiffStyle }) {
  const theme = useTuiTheme()
  const lines = props.diff ? props.diff.split(/\r?\n/) : ["No changes."]
  return (
    <Box flexDirection="column" paddingX={5}>
      {lines.map((line, index) => {
        const colorKind = diffLineColor(line, props.style)
        const color = colorKind === "add" ? theme.colors.diffAdd : colorKind === "remove" ? theme.colors.diffRemove : colorKind === "meta" ? theme.colors.diffMeta : undefined
        return <Text key={`${index}-${line}`} color={color} dimColor={props.style === "compact" && line.startsWith(" ")}>{line || " "}</Text>
      })}
    </Box>
  )
}
