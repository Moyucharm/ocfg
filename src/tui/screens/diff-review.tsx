import React, { useState } from "react"
import { Box, Text, useInput } from "ink"
import type { DiffReviewState } from "../types.js"

const actions = ["Confirm", "Cancel"] as const

export function DiffReviewScreen(props: { review: DiffReviewState; onConfirm: () => void; onCancel: () => void }) {
  const [selected, setSelected] = useState(1)

  useInput((input, key) => {
    if (props.review.completed) {
      if (input === "q" || input === "b" || key.return) props.onCancel()
      return
    }
    if (input === "q") props.onCancel()
    if (key.leftArrow || key.upArrow) setSelected((current) => (current === 0 ? actions.length - 1 : current - 1))
    if (key.rightArrow || key.downArrow) setSelected((current) => (current === actions.length - 1 ? 0 : current + 1))
    if (key.return) {
      if (actions[selected] === "Confirm") props.onConfirm()
      else props.onCancel()
    }
  })

  if (props.review.completed) {
    return (
      <Box flexDirection="column">
        <Text bold color="green">Review confirmed.</Text>
        <Text>No write was performed by this screen in this TUI wave.</Text>
        <Text>Next steps: validate the config and restart OpenCode if the running session does not pick up provider changes.</Text>
        <Text dimColor>Press Enter, b, or q to return Home.</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <Text bold>Diff Review</Text>
      <Text dimColor>{props.review.targetPath}</Text>
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
