import React, { useEffect, useRef, useState } from "react"
import { Box, Text, useStdout } from "ink"
import { useTuiInput } from "../input.js"
import { useTuiText } from "../i18n.js"
import { matchesKeybind, useTuiKeybinds } from "../keybinds.js"
import type { TuiDiffStyle } from "../preferences.js"
import { useTuiTheme } from "../theme.js"
import type { DiffReviewState } from "../types.js"
import { DiffBlock, formatOpenCodeTitle, OpenCodeActionLine, OpenCodeNotice, type OpenCodeMenuItem } from "../ui.js"

const actions = [
  { id: "confirm", danger: false },
  { id: "cancel", danger: true },
] as const

function diffLineCount(diff: string) {
  return diff ? diff.split(/\r?\n/).length : 1
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
  const writing = useRef(false)
  const [diffOffset, setDiffOffset] = useState(0)
  const t = useTuiText()
  const { stdout } = useStdout()
  const keybinds = useTuiKeybinds()
  const diffLines = diffLineCount(props.review.diff)
  const diagnosticsRows = props.review.diagnostics && props.review.diagnostics.length > 0 ? props.review.diagnostics.length + 2 : 0
  const staticRows = 12 + (props.review.secretFile ? 1 : 0) + (props.review.promptFile ? 1 : 0) + diagnosticsRows
  const maxDiffLines = Math.max(1, (stdout.rows ?? 24) - staticRows)
  const maxDiffOffset = Math.max(0, diffLines - maxDiffLines)
  const renderedDiffOffset = Math.min(diffOffset, maxDiffOffset)
  const actionItems: OpenCodeMenuItem[] = actions.map((action) => ({
    id: action.id,
    label: action.id === "confirm" ? t("diff.confirm") : t("diff.cancel"),
    danger: action.danger,
  }))

  useEffect(() => {
    setDiffOffset(0)
  }, [props.review.diff, props.review.targetPath])

  function selectPrevious() {
    setSelected((current) => (current === 0 ? actions.length - 1 : current - 1))
  }

  function selectNext() {
    setSelected((current) => (current === actions.length - 1 ? 0 : current + 1))
  }

  function performAction(actionIndex: number) {
    if (actions[actionIndex]?.id === "confirm") {
      if (writing.current) return
      writing.current = true
      void Promise.resolve().then(() => props.onConfirm()).finally(() => {
        writing.current = false
      })
    } else {
      props.onCancel()
    }
  }

  function scrollDiff(delta: number) {
    setDiffOffset((current) => Math.max(0, Math.min(maxDiffOffset, current + delta)))
  }

  useTuiInput((input, key) => {
    if (props.review.completed || props.review.error) {
      if (matchesKeybind("quit", input, key, keybinds) || matchesKeybind("back", input, key, keybinds) || matchesKeybind("confirm", input, key, keybinds)) props.onClose()
      return
    }

    if (writing.current) return
    if (matchesKeybind("quit", input, key, keybinds) || matchesKeybind("back", input, key, keybinds)) props.onCancel()
    if (matchesKeybind("up", input, key, keybinds)) {
      if (maxDiffOffset > 0) scrollDiff(-1)
      else selectPrevious()
    }
    if (matchesKeybind("down", input, key, keybinds)) {
      if (maxDiffOffset > 0) scrollDiff(1)
      else selectNext()
    }
    if (matchesKeybind("left", input, key, keybinds)) selectPrevious()
    if (matchesKeybind("right", input, key, keybinds)) selectNext()
    if (matchesKeybind("confirm", input, key, keybinds)) performAction(selected)
  })

  if (props.review.completed) {
    return (
      <Box flexDirection="column">
        <Header title={t("diff.configWritten")} />
        <Text> </Text>
        <Section title={t("diff.result")} />
        <FieldRow label={t("diff.target")} value={props.review.result?.targetPath ?? props.review.targetPath} />
        {props.review.result?.backupPath ? <FieldRow label={t("diff.backup")} value={props.review.result.backupPath} /> : null}
        {props.review.secretFilePath ? <FieldRow label={t("diff.apiKeyFile")} value={props.review.secretFilePath} /> : null}
        {props.review.promptFilePath ? <FieldRow label={t("diff.promptFile")} value={props.review.promptFilePath} /> : null}
        <Text> </Text>
        <OpenCodeNotice tone="success">{t("diff.restart")}</OpenCodeNotice>
        <Text> </Text>
        <Section title={t("diff.actions")} />
        <OpenCodeActionLine item={{ id: "close", label: t("common.close") }} selected />
        <Text> </Text>
        <Footer items={[`${t("common.close")}\tenter`, `${t("common.back")}\tb/q`]} />
      </Box>
    )
  }

  if (props.review.error) {
    return (
      <Box flexDirection="column">
        <Header title={t("diff.writeFailed")} />
        <Text> </Text>
        <Section title={t("diff.error")} />
        <FieldRow label={t("diff.message")} value={props.review.error} />
        <Text> </Text>
        <Section title={t("diff.actions")} />
        <OpenCodeActionLine item={{ id: "close", label: t("common.close") }} selected />
        <Text> </Text>
        <Footer items={[`${t("common.close")}\tenter`, `${t("common.back")}\tb/q`]} />
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <Header title={t("diff.review")} />
      <Text> </Text>
      <Section title={t("diff.target")} />
      <FieldRow label={t("diff.path")} value={props.review.targetPath} />
      {props.review.secretFile ? <FieldRow label={t("diff.apiKeyFile")} value={props.review.secretFile.path} dim /> : null}
      {props.review.promptFile ? <FieldRow label={t("diff.promptFile")} value={props.review.promptFile.path} dim /> : null}
      <Text> </Text>
      {props.review.diagnostics && props.review.diagnostics.length > 0 ? (
        <>
          <Section title={t("diff.diagnostics")} />
          {props.review.diagnostics.map((diagnostic, index) => (
            <FieldRow key={`${diagnostic.message}-${index}`} label={diagnostic.severity} value={diagnostic.message} />
          ))}
          <Text> </Text>
        </>
      ) : null}
      <Section title={maxDiffOffset > 0 ? t("diff.changesRange", { start: renderedDiffOffset + 1, end: Math.min(renderedDiffOffset + maxDiffLines, diffLines), total: diffLines }) : t("diff.changes")} />
      <DiffBlock diff={props.review.diff} style={props.diffStyle} offset={renderedDiffOffset} maxLines={maxDiffLines} />
      <Text> </Text>
      <Section title={t("diff.actions")} />
      {actionItems.map((action, index) => (
        <OpenCodeActionLine key={action.id} item={action} selected={index === selected} />
      ))}
      <Text> </Text>
      <Footer items={maxDiffOffset > 0 ? [`${t("common.select")}\tenter`, `${t("common.scroll")}\tup/down`, `${t("common.cancel")}\tesc`] : [`${t("common.select")}\tenter`, `${t("common.cancel")}\tesc`]} />
    </Box>
  )
}
