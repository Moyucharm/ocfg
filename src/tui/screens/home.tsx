import React, { useState } from "react"
import { Box, Text, useInput } from "ink"
import type { TuiAction } from "../types.js"

type MenuItem = {
  label: string
  description: string
  action: TuiAction
}

const items: MenuItem[] = [
  { label: "Doctor", description: "Inspect provider configuration diagnostics", action: "doctor" },
  { label: "Add Provider", description: "Start provider creation flow", action: "add-provider" },
  { label: "Edit Provider", description: "Edit an existing provider", action: "edit-provider" },
  { label: "Delete Provider", description: "Delete provider or model safely", action: "delete-provider" },
  { label: "Set Default Model", description: "Set or clear model and small_model", action: "set-default-model" },
  { label: "Switch Config Target", description: "Choose global or project config", action: "switch-config" },
]

export function HomeScreen(props: { onAction: (action: TuiAction) => void; onQuit: () => void }) {
  const [selected, setSelected] = useState(0)

  useInput((input, key) => {
    if (input === "q") props.onQuit()
    if (key.upArrow) setSelected((current) => (current === 0 ? items.length - 1 : current - 1))
    if (key.downArrow) setSelected((current) => (current === items.length - 1 ? 0 : current + 1))
    if (key.return) props.onAction(items[selected]!.action)
  })

  return (
    <Box flexDirection="column">
      <Text bold>Home</Text>
      {items.map((item, index) => (
        <Text key={item.action} color={index === selected ? "green" : undefined}>
          {index === selected ? "›" : " "} {item.label} - {item.description}
        </Text>
      ))}
    </Box>
  )
}
