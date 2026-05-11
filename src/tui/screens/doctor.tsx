import React, { useEffect, useState } from "react"
import { Box, Text, useInput } from "ink"
import { readConfig } from "../../core/config-reader.js"
import { locateConfig } from "../../core/config-locator.js"
import { runDoctor } from "../../core/doctor.js"
import type { Diagnostic, Severity } from "../../core/types.js"
import type { TuiConfigSelection } from "../types.js"

const severities: Severity[] = ["high", "medium", "low"]

function groupDiagnostics(diagnostics: Diagnostic[]) {
  return Object.fromEntries(severities.map((severity) => [severity, diagnostics.filter((diagnostic) => diagnostic.severity === severity)])) as Record<
    Severity,
    Diagnostic[]
  >
}

export function DoctorScreen(props: { selection: TuiConfigSelection; onBack: () => void }) {
  const [loading, setLoading] = useState(true)
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([])
  const [targetPath, setTargetPath] = useState("")
  const [error, setError] = useState<string>()

  useInput((input) => {
    if (input === "q" || input === "b") props.onBack()
  })

  useEffect(() => {
    let active = true
    async function inspect() {
      try {
        const target = props.selection.target ?? locateConfig({ scope: props.selection.scope })
        const document = await readConfig(target)
        if (!active) return
        setTargetPath(target.path)
        setDiagnostics(runDoctor(document))
      } catch (caught) {
        if (!active) return
        setError(caught instanceof Error ? caught.message : String(caught))
      } finally {
        if (active) setLoading(false)
      }
    }
    inspect()
    return () => {
      active = false
    }
  }, [props.selection])

  if (loading) return <Text>Inspecting config...</Text>
  if (error) return <Text color="red">Doctor failed: {error}</Text>

  const grouped = groupDiagnostics(diagnostics)

  return (
    <Box flexDirection="column">
      <Text bold>Doctor</Text>
      <Text dimColor>{targetPath || "No config target"}</Text>
      {diagnostics.length === 0 ? <Text color="green">No diagnostics found.</Text> : null}
      {severities.map((severity) => (
        <Box key={severity} flexDirection="column" marginTop={1}>
          <Text bold color={severity === "high" ? "red" : severity === "medium" ? "yellow" : "blue"}>
            {severity.toUpperCase()} ({grouped[severity].length})
          </Text>
          {grouped[severity].map((diagnostic, index) => (
            <Text key={`${severity}-${index}`}>
              {diagnostic.path ? `${diagnostic.path} ` : ""}{diagnostic.message}
            </Text>
          ))}
        </Box>
      ))}
      <Text dimColor>Press b, q, or Esc to return Home.</Text>
    </Box>
  )
}
