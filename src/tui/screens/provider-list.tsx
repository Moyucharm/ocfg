import React, { useEffect, useState } from "react"
import { Box, Text, useInput } from "ink"
import { locateConfig } from "../../core/config-locator.js"
import { readConfig } from "../../core/config-reader.js"
import type { TuiConfigSelection } from "../types.js"

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

export function ProviderListScreen(props: { selection: TuiConfigSelection; onAdd: () => void; onBack: () => void }) {
  const [providers, setProviders] = useState<Array<{ id: string; name?: string }>>([])
  const [targetPath, setTargetPath] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()

  useInput((input, key) => {
    if (input === "q" || input === "b") props.onBack()
    if (key.return) props.onAdd()
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

  return (
    <Box flexDirection="column">
      <Text bold>Providers</Text>
      <Text dimColor>{targetPath || "No config target"}</Text>
      {providers.length === 0 ? <Text color="yellow">No providers configured in this target.</Text> : null}
      {providers.map((provider) => (
        <Text key={provider.id}>- {provider.id}{provider.name ? ` (${provider.name})` : ""}</Text>
      ))}
      <Text color="green">› Add new provider</Text>
      <Text dimColor>Enter adds a provider. b, q, or Esc returns Home.</Text>
    </Box>
  )
}
