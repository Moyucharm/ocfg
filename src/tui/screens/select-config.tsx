import React, { useState } from "react"
import { Box, Text, useInput } from "ink"
import { locateConfig } from "../../core/config-locator.js"
import type { ConfigScope } from "../../core/types.js"
import type { TuiConfigSelection } from "../types.js"

const scopes: ConfigScope[] = ["global", "project"]

export function SelectConfigScreen(props: {
  selection: TuiConfigSelection
  onSelect: (selection: TuiConfigSelection) => void
  onBack: () => void
}) {
  const [selected, setSelected] = useState(() => Math.max(0, scopes.indexOf(props.selection.scope)))

  useInput((input, key) => {
    if (input === "q") props.onBack()
    if (key.upArrow) setSelected((current) => (current === 0 ? scopes.length - 1 : current - 1))
    if (key.downArrow) setSelected((current) => (current === scopes.length - 1 ? 0 : current + 1))
    if (key.return) {
      const scope = scopes[selected]!
      props.onSelect({ scope, target: locateConfig({ scope }) })
    }
  })

  return (
    <Box flexDirection="column">
      <Text bold>Select Config Target</Text>
      <Text dimColor>Choosing project does not create a config file until a later confirmed write.</Text>
      {scopes.map((scope, index) => {
        const target = locateConfig({ scope })
        return (
          <Text key={scope} color={index === selected ? "green" : undefined}>
            {index === selected ? "›" : " "} {scope} - {target.path}{target.exists ? "" : " (missing; not created)"}
          </Text>
        )
      })}
      <Text dimColor>Enter selects, q or Esc returns Home.</Text>
    </Box>
  )
}
