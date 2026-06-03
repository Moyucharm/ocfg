import React, { useEffect, useState } from "react"
import { Box, Text } from "ink"
import { readConfig } from "../../core/config-reader.js"
import { locateConfig } from "../../core/config-locator.js"
import { runDoctor } from "../../core/doctor.js"
import type { Diagnostic, Severity } from "../../core/types.js"
import { useTuiText } from "../i18n.js"
import { useTuiInput } from "../input.js"
import { matchesKeybind, useTuiKeybinds } from "../keybinds.js"
import { useTuiTheme } from "../theme.js"
import type { TuiConfigSelection } from "../types.js"
import { formatOpenCodeTitle, useDelayedLoading } from "../ui.js"

const severities: Severity[] = ["high", "medium", "low"]

function groupDiagnostics(diagnostics: Diagnostic[]) {
  return Object.fromEntries(severities.map((severity) => [severity, diagnostics.filter((diagnostic) => diagnostic.severity === severity)])) as Record<Severity, Diagnostic[]>
}

function severityLabel(severity: Severity) {
  return severity.toUpperCase()
}

export function DoctorScreen(props: { selection: TuiConfigSelection; onBack: () => void }) {
  const t = useTuiText()
  const [loading, setLoading] = useState(true)
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([])
  const [error, setError] = useState<string>()
  const keybinds = useTuiKeybinds()
  const theme = useTuiTheme()

  useTuiInput((input, key) => {
    if (matchesKeybind("quit", input, key, keybinds) || matchesKeybind("back", input, key, keybinds)) props.onBack()
  })

  useEffect(() => {
    let active = true
    async function inspect() {
      setLoading(true)
      setError(undefined)
      try {
        const target = props.selection.target ?? locateConfig({ scope: props.selection.scope })
        const document = await readConfig(target)
        if (!active) return
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

  const showLoading = useDelayedLoading(loading)

  if (loading) return showLoading ? <Text>{formatOpenCodeTitle(t("doctor.title"))} {t("doctor.inspecting")}</Text> : null
  if (error) return <Text color="red">{t("doctor.failed", { message: error })}</Text>

  const grouped = groupDiagnostics(diagnostics)

  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between" paddingX={5}>
        <Text bold>{formatOpenCodeTitle(t("doctor.title"))}</Text>
        <Text color={theme.colors.shortcut}>esc</Text>
      </Box>
      <Text> </Text>
      {diagnostics.length === 0 ? (
        <Box paddingX={5}>
          <Text color={theme.colors.success}>{t("doctor.none")}</Text>
        </Box>
      ) : null}
      {severities.map((severity) => {
        const items = grouped[severity]
        if (items.length === 0) return null
        return (
          <Box key={severity} flexDirection="column" marginTop={severity === "high" ? 0 : 1}>
            <Box paddingX={5}>
              <Text bold color={theme.colors.section}>{severityLabel(severity)}</Text>
            </Box>
            {items.map((diagnostic, index) => (
              <Box key={`${severity}-${index}`} flexDirection="column" paddingX={5}>
                {diagnostic.path ? <Text color={theme.colors.muted} wrap="wrap">{diagnostic.path}</Text> : null}
                <Text color={severity === "high" ? theme.colors.error : theme.colors.primary} wrap="wrap">{diagnostic.message}</Text>
              </Box>
            ))}
          </Box>
        )
      })}
      <Text> </Text>
      <Box paddingX={5}>
        <Text bold>{t("common.back")}<Text color={theme.colors.shortcut}> esc</Text></Text>
      </Box>
    </Box>
  )
}
