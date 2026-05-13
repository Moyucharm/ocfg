import React, { useState } from "react"
import { Box, Text, useInput } from "ink"
import type { DiffReviewState } from "../types.js"

const actions = ["Confirm", "Cancel"] as const

export function DiffReviewScreen(props: { review: DiffReviewState; onConfirm: () => Promise<void> | void; onCancel: () => void; onClose: () => void }) {
  const [selected, setSelected] = useState(0)
  const [writing, setWriting] = useState(false)

  useInput((input, key) => {
    if (writing) return
    if (props.review.completed || props.review.error) {
      if (input === "q" || input === "b" || key.return) props.onClose()
      return
    }
    if (input === "q") props.onCancel()
    if (key.leftArrow || key.upArrow) setSelected((current) => (current === 0 ? actions.length - 1 : current - 1))
    if (key.rightArrow || key.downArrow) setSelected((current) => (current === actions.length - 1 ? 0 : current + 1))
    if (key.return) {
      if (actions[selected] === "Confirm") {
        setWriting(true)
        Promise.resolve(props.onConfirm()).finally(() => setWriting(false))
      }
      else props.onCancel()
    }
  })

  if (props.review.completed) {
    return (
      <Box flexDirection="column">
        <Text bold color="green">Config written.</Text>
        <Text>Target: {props.review.result?.targetPath ?? props.review.targetPath}</Text>
        {props.review.result?.backupPath ? <Text>Backup: {props.review.result.backupPath}</Text> : null}
        {props.review.secretFilePath ? <Text>API key file: {props.review.secretFilePath}</Text> : null}
        <Text>Next steps: restart OpenCode if the running session does not pick up provider changes.</Text>
        <Text dimColor>Press Enter, b, or q to return Home.</Text>
      </Box>
    )
  }

  if (props.review.error) {
    return (
      <Box flexDirection="column">
        <Text bold color="red">Write failed.</Text>
        <Text>{props.review.error}</Text>
        <Text dimColor>Press Enter, b, or q to return Home.</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <Text bold>Diff Review</Text>
      <Text dimColor>{props.review.targetPath}</Text>
      {props.review.secretFile ? <Text dimColor>API key will be stored at: {props.review.secretFile.path}</Text> : null}
      {writing ? <Text color="yellow">Writing...</Text> : null}
      {props.review.diagnostics && props.review.diagnostics.length > 0 ? (
        <Box flexDirection="column" marginY={1}>
          <Text color="yellow">Diagnostics must be resolved before writing:</Text>
          {props.review.diagnostics.map((diagnostic, index) => (
            <Text key={index}>[{diagnostic.severity}] {diagnostic.message}</Text>
          ))}
        </Box>
      ) : null}
      <Box borderStyle="round" flexDirection="column" paddingX={1}>
        <Text>{props.review.diff || "No changes."}</Text>
      </Box>
      <Text color="yellow">A write must be explicitly confirmed before it can happen.</Text>
      <Box gap={2}>
        {actions.map((action, index) => (
          <Text key={action} color={index === selected ? "green" : undefined}>
            {index === selected ? "›" : " "} {action}
          </Text>
        ))}
      </Box>
      <Text dimColor>Enter selects, q or Esc cancels.</Text>
    </Box>
  )
}
