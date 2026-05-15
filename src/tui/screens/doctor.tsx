import React, { useEffect, useState } from "react"
import { Text } from "ink"
import { readConfig } from "../../core/config-reader.js"
import { locateConfig } from "../../core/config-locator.js"
import { runDoctor } from "../../core/doctor.js"
import type { Diagnostic, Severity } from "../../core/types.js"
import { useTuiInput } from "../input.js"
import { matchesKeybind, useTuiKeybinds } from "../keybinds.js"
import type { TuiConfigSelection } from "../types.js"
import { OpenCodeMenu, openCodeMenuRows, type OpenCodeMenuGroup } from "../ui.js"

const severities: Severity[] = ["high", "medium", "low"]

function groupDiagnostics(diagnostics: Diagnostic[]) {
  return Object.fromEntries(severities.map((severity) => [severity, diagnostics.filter((diagnostic) => diagnostic.severity === severity)])) as Record<Severity, Diagnostic[]>
}

export function DoctorScreen(props: { selection: TuiConfigSelection; onBack: () => void }) {
  const [loading, setLoading] = useState(true)
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([])
  const [error, setError] = useState<string>()
  const keybinds = useTuiKeybinds()

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

  if (loading) return <Text>Inspecting config...</Text>
  if (error) return <Text color="red">Doctor failed: {error}</Text>

  const grouped = groupDiagnostics(diagnostics)
  const groups: OpenCodeMenuGroup[] = diagnostics.length === 0
    ? [{ title: "Diagnostics", items: [{ id: "clean", label: "No diagnostics found", shortcut: "ok", disabled: true }] }]
    : severities.map((severity) => ({
      title: severity.toUpperCase(),
      items: grouped[severity].map((diagnostic, index) => ({
        id: `${severity}-${index}`,
        label: diagnostic.path ? `${diagnostic.path} ${diagnostic.message}` : diagnostic.message,
        shortcut: severity,
        disabled: true,
        danger: severity === "high",
      })),
    }))

  return <OpenCodeMenu title="Doctor" query="" rows={openCodeMenuRows(groups, "")} selectedIndex={0} footer={["Back\tesc"]} />
}
