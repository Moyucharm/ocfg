import React, { useState } from "react"
import { Box, Text, useInput } from "ink"
import type { DeleteTargetState } from "../types.js"

const actions = ["Confirm", "Cancel"] as const

function appendInput(value: string, input: string) {
  const printable = input.replace(/[\u0000-\u001F\u007F]/g, "")
  if (!printable) return value
  return `${value}${printable}`
}

export function DeleteConfirmScreen(props: {
  target: DeleteTargetState
  onConfirm: (token?: string) => void
  onCancel: () => void
}) {
  const [selected, setSelected] = useState(0)
  const [token, setToken] = useState("")
  const requiresToken = props.target.references.length > 0
  const targetLabel = props.target.kind === "provider" ? props.target.providerID : `${props.target.providerID}/${props.target.modelID}`
  const expectedToken = props.target.kind === "provider" ? `delete:${props.target.providerID}` : `delete:${props.target.providerID}/${props.target.modelID}`

  useInput((input, key) => {
    if (input === "q" || input === "b") {
      props.onCancel()
      return
    }
    if (requiresToken) {
      if (key.backspace || key.delete) setToken((current) => current.slice(0, -1))
      else if (key.return) props.onConfirm(token.trim())
      else setToken((current) => appendInput(current, input))
      return
    }
    if (key.leftArrow || key.upArrow) setSelected((current) => (current === 0 ? actions.length - 1 : current - 1))
    if (key.rightArrow || key.downArrow) setSelected((current) => (current === actions.length - 1 ? 0 : current + 1))
    if (key.return) {
      if (actions[selected] === "Confirm") props.onConfirm()
      else props.onCancel()
    }
  })

  return (
    <Box flexDirection="column">
      <Text bold color="red">
        Delete {props.target.kind === "provider" ? "Provider" : "Model"}
      </Text>
      <Text>{targetLabel}</Text>
      {props.target.references.length > 0 ? (
        <Box flexDirection="column" marginY={1}>
          <Text color="yellow">This target is referenced by:</Text>
          {props.target.references.map((reference) => <Text key={reference}>{reference}</Text>)}
          <Text color="yellow">Type this token to continue:</Text>
          <Text>{expectedToken}</Text>
          <Text>Token: {token || "_"}</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginY={1}>
          <Text>The diff will be shown before anything is written.</Text>
          {actions.map((action, index) => (
            <Text key={action} color={index === selected ? "green" : undefined}>
              {index === selected ? "›" : " "} {action}
            </Text>
          ))}
        </Box>
      )}
      {props.target.error ? <Text color="red">{props.target.error}</Text> : null}
      <Text dimColor>{requiresToken ? "Enter continues, b/q cancels." : "Enter selects, b/q cancels."}</Text>
    </Box>
  )
}
