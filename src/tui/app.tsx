import React, { useState } from "react"
import { Box, Text, useApp, useInput } from "ink"
import { createConfigDiff } from "../core/diff.js"
import { locateConfig } from "../core/config-locator.js"
import { readConfig } from "../core/config-reader.js"
import { validateConfig } from "../core/schema-validator.js"
import { writeConfigSafely } from "../core/config-writer.js"
import { addProvider } from "../core/provider-editor.js"
import { applyProviderEdit } from "../core/jsonc-editor.js"
import { HomeScreen } from "./screens/home.js"
import { SelectConfigScreen } from "./screens/select-config.js"
import { DoctorScreen } from "./screens/doctor.js"
import { DiffReviewScreen } from "./screens/diff-review.js"
import { ProviderListScreen } from "./screens/provider-list.js"
import { ProviderEditScreen } from "./screens/provider-edit.js"
import { ModelEditScreen } from "./screens/model-edit.js"
import type { GeneratedProviderDraft } from "../core/provider-generator.js"
import type { DiffReviewState, ProviderFlowDraft, TuiAction, TuiConfigSelection, TuiRoute } from "./types.js"

export function App() {
  const { exit } = useApp()
  const [route, setRoute] = useState<TuiRoute>("home")
  const [config, setConfig] = useState<TuiConfigSelection>({ scope: "global" })
  const [message, setMessage] = useState<string>()
  const [providerDraft, setProviderDraft] = useState<ProviderFlowDraft>()
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
    if (action === "add-provider") setRoute("provider-list")
    if (action === "edit-provider" || action === "delete-provider") {
      setMessage("This TUI flow is coming in the next wave. Use the CLI command for now.")
    }
  }

  async function prepareProviderWrite(generated: GeneratedProviderDraft) {
    try {
      const target = config.target ?? locateConfig({ scope: config.scope })
      const document = await readConfig(target)
      const nextConfig = addProvider(document.data, generated.provider)
      const providerConfig = (nextConfig.provider as Record<string, unknown>)[generated.provider.id]
      const nextText = applyProviderEdit(document, generated.provider.id, providerConfig)
      setDiffReview({
        targetPath: target.path,
        diff: createConfigDiff(document.target.exists ? document.text : "", nextText),
        document,
        nextConfig,
        nextText,
      })
      setRoute("diff-review")
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught))
      setRoute("home")
    }
  }

  async function confirmWrite() {
    if (!diffReview.document || !diffReview.nextConfig || !diffReview.nextText) {
      setDiffReview((current) => ({ ...current, error: "No pending write is available." }))
      return
    }
    try {
      const result = await writeConfigSafely({
        document: diffReview.document,
        nextConfig: diffReview.nextConfig,
        nextText: diffReview.nextText,
        validate: (nextConfig) => validateConfig(nextConfig, { relaxModelEnum: true }),
      })
      if (result.diagnostics.length > 0) {
        setDiffReview((current) => ({ ...current, diagnostics: result.diagnostics, error: result.diagnostics.map((diagnostic) => diagnostic.message).join("\n") }))
        return
      }
      setDiffReview((current) => ({ ...current, result, completed: true }))
    } catch (caught) {
      setDiffReview((current) => ({ ...current, error: caught instanceof Error ? caught.message : String(caught) }))
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
      {route === "provider-list" ? <ProviderListScreen selection={config} onAdd={() => setRoute("provider-edit")} onBack={() => setRoute("home")} /> : null}
      {route === "provider-edit" ? (
        <ProviderEditScreen
          onBack={() => setRoute("home")}
          onComplete={(draft) => {
            setProviderDraft(draft)
            setRoute("model-edit")
          }}
        />
      ) : null}
      {route === "model-edit" && providerDraft ? (
        <ModelEditScreen draft={providerDraft} onBack={() => setRoute("home")} onReview={prepareProviderWrite} />
      ) : null}
      {route === "diff-review" ? (
        <DiffReviewScreen
          review={diffReview}
          onCancel={() => setRoute("home")}
          onConfirm={confirmWrite}
        />
      ) : null}
    </Box>
  )
}
