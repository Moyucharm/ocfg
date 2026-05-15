import React, { useState } from "react"
import { Box, Text } from "ink"
import { useTuiInput } from "../input.js"
import { matchesKeybind, useTuiKeybinds } from "../keybinds.js"
import { parseTuiMouseEvent, type TuiMouseEvent } from "../mouse.js"
import type { TuiDiffStyle } from "../preferences.js"
import { useTuiTheme } from "../theme.js"
import type { DiffReviewState } from "../types.js"
import { DiffBlock, formatOpenCodeTitle, OpenCodeActionLine, OpenCodeNotice, type OpenCodeMenuItem } from "../ui.js"

const actions = [
  { id: "confirm", label: "Confirm" },
  { id: "cancel", label: "Cancel", danger: true },
] satisfies OpenCodeMenuItem[]

function diffLineCount(diff: string) {
  return diff ? diff.split(/\r?\n/).length : 1
}

function actionIndexFromMouse(event: TuiMouseEvent, review: DiffReviewState, writing: boolean) {
  if (event.kind !== "press" || event.button !== "left") return undefined
  let rowsBeforeActions = 0
  rowsBeforeActions += 1 // title
  rowsBeforeActions += 1 // spacer
  rowsBeforeActions += 1 // Target section
  rowsBeforeActions += 1 // target path
  if (review.secretFile) rowsBeforeActions += 1
  rowsBeforeActions += 1 // spacer
  if (writing) rowsBeforeActions += 1
  if (review.diagnostics && review.diagnostics.length > 0) {
    rowsBeforeActions += 1 // Diagnostics section
    rowsBeforeActions += review.diagnostics.length
    rowsBeforeActions += 1 // spacer
  }
  rowsBeforeActions += 1 // Changes section
  rowsBeforeActions += diffLineCount(review.diff)
  rowsBeforeActions += 1 // spacer
  rowsBeforeActions += 1 // Actions section

  const actionIndex = event.y - (rowsBeforeActions + 1)
  return actionIndex >= 0 && actionIndex < actions.length ? actionIndex : undefined
}

function Header(props: { title: string }) {
  const theme = useTuiTheme()
  return (
    <Box justifyContent="space-between" paddingX={5}>
      <Text bold>{formatOpenCodeTitle(props.title)}</Text>
      <Text color={theme.colors.shortcut}>esc</Text>
    </Box>
  )
}

function Section(props: { title: string }) {
  const theme = useTuiTheme()
  return (
    <Box paddingX={5}>
      <Text bold color={theme.colors.section}>{props.title}</Text>
    </Box>
  )
}

function FieldRow(props: { label: string; value: string; dim?: boolean }) {
  const theme = useTuiTheme()
  return (
    <Box paddingX={5}>
      <Text color={props.dim ? theme.colors.muted : theme.colors.primary}>
        <Text color={theme.colors.muted}>{props.label}: </Text>
        {props.value}
      </Text>
    </Box>
  )
}

function Footer(props: { items: string[] }) {
  const theme = useTuiTheme()
  return (
    <Box paddingX={5} gap={3}>
      {props.items.map((item, index) => {
        const [label, shortcut] = item.split("\t")
        return (
          <Text key={`${item}-${index}`} bold>
            {label}{shortcut ? <Text color={theme.colors.shortcut}> {shortcut}</Text> : null}
          </Text>
        )
      })}
    </Box>
  )
}

export function DiffReviewScreen(props: {
  review: DiffReviewState
  diffStyle: TuiDiffStyle
  onConfirm: () => Promise<void> | void
  onCancel: () => void
  onClose: () => void
}) {
  const [selected, setSelected] = useState(0)
  const [writing, setWriting] = useState(false)
  const keybinds = useTuiKeybinds()

  function selectPrevious() {
    setSelected((current) => (current === 0 ? actions.length - 1 : current - 1))
  }

  function selectNext() {
    setSelected((current) => (current === actions.length - 1 ? 0 : current + 1))
  }

  function performAction(actionIndex: number) {
    if (actions[actionIndex]?.id === "confirm") {
      setWriting(true)
      void Promise.resolve().then(() => props.onConfirm()).finally(() => setWriting(false))
    } else {
      props.onCancel()
    }
  }

  useTuiInput((input, key) => {
    const mouseEvent = parseTuiMouseEvent(input)
    if (props.review.completed || props.review.error) {
      if (mouseEvent?.kind === "press" && mouseEvent.button === "left") props.onClose()
      if (matchesKeybind("quit", input, key, keybinds) || matchesKeybind("back", input, key, keybinds) || matchesKeybind("confirm", input, key, keybinds)) props.onClose()
      return
    }

    if (writing) return
    if (mouseEvent) {
      if (mouseEvent.kind === "wheel" && mouseEvent.button === "wheel-up") selectPrevious()
      if (mouseEvent.kind === "wheel" && mouseEvent.button === "wheel-down") selectNext()
      const clicked = actionIndexFromMouse(mouseEvent, props.review, writing)
      if (clicked !== undefined) {
        setSelected(clicked)
        performAction(clicked)
      }
      return
    }
    if (matchesKeybind("quit", input, key, keybinds) || matchesKeybind("back", input, key, keybinds)) props.onCancel()
    if (matchesKeybind("left", input, key, keybinds) || matchesKeybind("up", input, key, keybinds)) selectPrevious()
    if (matchesKeybind("right", input, key, keybinds) || matchesKeybind("down", input, key, keybinds)) selectNext()
    if (matchesKeybind("confirm", input, key, keybinds)) performAction(selected)
  })

  if (props.review.completed) {
    return (
      <Box flexDirection="column">
        <Header title="Config written" />
        <Text> </Text>
        <Section title="Result" />
        <FieldRow label="Target" value={props.review.result?.targetPath ?? props.review.targetPath} />
        {props.review.result?.backupPath ? <FieldRow label="Backup" value={props.review.result.backupPath} /> : null}
        {props.review.secretFilePath ? <FieldRow label="API key file" value={props.review.secretFilePath} /> : null}
        <Text> </Text>
        <OpenCodeNotice tone="success">Restart OpenCode if the running session does not pick up provider changes.</OpenCodeNotice>
        <Text> </Text>
        <Section title="Actions" />
        <OpenCodeActionLine item={{ id: "close", label: "Close" }} selected />
        <Text> </Text>
        <Footer items={["Close\tenter", "Back\tb/q"]} />
      </Box>
    )
  }

  if (props.review.error) {
    return (
      <Box flexDirection="column">
        <Header title="Write failed" />
        <Text> </Text>
        <Section title="Error" />
        <FieldRow label="Message" value={props.review.error} />
        <Text> </Text>
        <Section title="Actions" />
        <OpenCodeActionLine item={{ id: "close", label: "Close" }} selected />
        <Text> </Text>
        <Footer items={["Close\tenter", "Back\tb/q"]} />
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <Header title="Diff review" />
      <Text> </Text>
      <Section title="Target" />
      <FieldRow label="Path" value={props.review.targetPath} />
      {props.review.secretFile ? <FieldRow label="API key file" value={props.review.secretFile.path} dim /> : null}
      <Text> </Text>
      {writing ? <OpenCodeNotice>Writing...</OpenCodeNotice> : null}
      {props.review.diagnostics && props.review.diagnostics.length > 0 ? (
        <>
          <Section title="Diagnostics" />
          {props.review.diagnostics.map((diagnostic, index) => (
            <FieldRow key={`${diagnostic.message}-${index}`} label={diagnostic.severity} value={diagnostic.message} />
          ))}
          <Text> </Text>
        </>
      ) : null}
      <Section title="Changes" />
      <DiffBlock diff={props.review.diff} style={props.diffStyle} />
      <Text> </Text>
      <Section title="Actions" />
      {actions.map((action, index) => (
        <OpenCodeActionLine key={action.id} item={action} selected={index === selected} />
      ))}
      <Text> </Text>
      <Footer items={["Select\tenter", "Cancel\tesc"]} />
    </Box>
  )
}
