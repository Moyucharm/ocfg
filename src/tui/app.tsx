import React, { useState } from "react"
import { Box, Text, useApp, useInput } from "ink"
import { createConfigDiff } from "../core/diff.js"
import { HomeScreen } from "./screens/home.js"
import { SelectConfigScreen } from "./screens/select-config.js"
import { DoctorScreen } from "./screens/doctor.js"
import { DiffReviewScreen } from "./screens/diff-review.js"
import type { DiffReviewState, TuiAction, TuiConfigSelection, TuiRoute } from "./types.js"

export function App() {
  const { exit } = useApp()
  const [route, setRoute] = useState<TuiRoute>("home")
  const [config, setConfig] = useState<TuiConfigSelection>({ scope: "global" })
  const [message, setMessage] = useState<string>()
  const [diffReview, setDiffReview] = useState<DiffReviewState>({
    targetPath: "No target selected",
    diff: createConfigDiff("", ""),
  })

  useInput((_input, key) => {
    if (key.escape) {
      if (route === "home") exit()
      else setRoute("home")
    }
  })

  function handleHomeAction(action: TuiAction) {
    setMessage(undefined)
    if (action === "doctor") setRoute("doctor")
    if (action === "switch-config") setRoute("select-config")
    if (action === "add-provider") {
      setDiffReview({
        targetPath: config.target?.path ?? `${config.scope} config`,
        diff: "Add Provider flow is implemented in the next TUI wave.",
      })
      setRoute("diff-review")
    }
    if (action === "edit-provider" || action === "delete-provider") {
      setMessage("This TUI flow is coming in the next wave. Use the CLI command for now.")
    }
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        <Text bold color="cyan">
          OpenCode Provider Editor
        </Text>
        <Text dimColor>Target: {config.target ? `${config.target.scope} ${config.target.path}` : config.scope}</Text>
        <Text dimColor>Press Esc to go back, q to quit from Home.</Text>
      </Box>

      {message ? <Text color="yellow">{message}</Text> : null}

      {route === "home" ? <HomeScreen onAction={handleHomeAction} onQuit={exit} /> : null}
      {route === "select-config" ? (
        <SelectConfigScreen
          selection={config}
          onSelect={(next) => {
            setConfig(next)
            setRoute("home")
          }}
          onBack={() => setRoute("home")}
        />
      ) : null}
      {route === "doctor" ? <DoctorScreen selection={config} onBack={() => setRoute("home")} /> : null}
      {route === "diff-review" ? (
        <DiffReviewScreen
          review={diffReview}
          onCancel={() => setRoute("home")}
          onConfirm={() => setDiffReview((current) => ({ ...current, completed: true }))}
        />
      ) : null}
    </Box>
  )
}
