import React, { useEffect, useState } from "react"
import { Box, Text, useInput } from "ink"
import { locateConfig } from "../../core/config-locator.js"
import { readConfig } from "../../core/config-reader.js"
import type { ProviderListMode, TuiConfigSelection } from "../types.js"

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

export function ProviderListScreen(props: {
  selection: TuiConfigSelection
  mode?: ProviderListMode
  onAdd?: () => void
  onSelectProvider?: (providerID: string) => void
  onBack: () => void
}) {
  const [providers, setProviders] = useState<Array<{ id: string; name?: string }>>([])
  const [selected, setSelected] = useState(0)
  const [targetPath, setTargetPath] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const mode = props.mode ?? "add"

  useInput((input, key) => {
    if (input === "q" || input === "b") props.onBack()
    if (providers.length === 0 && mode !== "add") return
    if (key.upArrow) setSelected((current) => (current === 0 ? Math.max(0, providers.length - 1) : current - 1))
    if (key.downArrow) setSelected((current) => (current === providers.length - 1 ? 0 : current + 1))
    if (key.return) {
      if (mode === "add") props.onAdd?.()
      else {
        const provider = providers[selected]
        if (provider) props.onSelectProvider?.(provider.id)
      }
    }
  })

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const target = props.selection.target ?? locateConfig({ scope: props.selection.scope })
        const document = await readConfig(target)
        const providerMap = isRecord(document.data.provider) ? document.data.provider : {}
        const nextProviders = Object.entries(providerMap).map(([id, value]) => ({
          id,
          name: isRecord(value) && typeof value.name === "string" ? value.name : undefined,
        }))
        if (!active) return
        setTargetPath(target.path)
        setProviders(nextProviders)
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : String(caught))
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [props.selection])

  if (loading) return <Text>Loading providers...</Text>
  if (error) return <Text color="red">Failed to load providers: {error}</Text>

  const title = mode === "edit" ? "Edit Provider" : mode === "delete" ? "Delete Provider" : "Providers"
  const help = mode === "add" ? "Enter adds a provider. b, q, or Esc returns Home." : "Enter selects a provider. b, q, or Esc returns Home."

  return (
    <Box flexDirection="column">
      <Text bold>{title}</Text>
      <Text dimColor>{targetPath || "No config target"}</Text>
      {providers.length === 0 ? <Text color="yellow">No providers configured in this target.</Text> : null}
      {providers.map((provider, index) => (
        <Text key={provider.id} color={mode !== "add" && index === selected ? "green" : undefined}>
          {mode !== "add" ? (index === selected ? "›" : " ") : "-"} {provider.id}{provider.name ? ` (${provider.name})` : ""}
        </Text>
      ))}
      {mode === "add" ? <Text color="green">› Add new provider</Text> : null}
      <Text dimColor>{help}</Text>
    </Box>
  )
}
