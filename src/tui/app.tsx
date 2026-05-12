import React, { useState } from "react"
import { Box, Text, useApp, useInput } from "ink"
import { createConfigDiff } from "../core/diff.js"
import { locateConfig } from "../core/config-locator.js"
import { readConfig } from "../core/config-reader.js"
import { validateConfig } from "../core/schema-validator.js"
import { restoreSecretFile, snapshotSecretFile, writeSecretFileSafely } from "../core/secret-file.js"
import { writeConfigSafely } from "../core/config-writer.js"
import { addProvider, updateModel, updateProvider } from "../core/provider-editor.js"
import { applyModelEdit, applyProviderEdit } from "../core/jsonc-editor.js"
import { HomeScreen } from "./screens/home.js"
import { SelectConfigScreen } from "./screens/select-config.js"
import { DoctorScreen } from "./screens/doctor.js"
import { DiffReviewScreen } from "./screens/diff-review.js"
import { ProviderListScreen } from "./screens/provider-list.js"
import { ProviderEditScreen } from "./screens/provider-edit.js"
import { ProviderEditExistingScreen } from "./screens/provider-edit-existing.js"
import { ModelListScreen } from "./screens/model-list.js"
import { ModelEditExistingScreen } from "./screens/model-edit-existing.js"
import { ModelEditScreen } from "./screens/model-edit.js"
import { buildExistingProviderEditPatch, type ExistingProviderEditDraft } from "./provider-edit-existing.js"
import { buildExistingModelEditPatch, type ExistingModelEditDraft } from "./model-edit-existing.js"
import type { GeneratedProviderDraft } from "../core/provider-generator.js"
import type { DiffReviewState, ProviderFlowDraft, ProviderListMode, TuiAction, TuiConfigSelection, TuiRoute } from "./types.js"

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

export function App() {
  const { exit } = useApp()
  const [route, setRoute] = useState<TuiRoute>("home")
  const [config, setConfig] = useState<TuiConfigSelection>({ scope: "global" })
  const [message, setMessage] = useState<string>()
  const [providerListMode, setProviderListMode] = useState<ProviderListMode>("add")
  const [providerDraft, setProviderDraft] = useState<ProviderFlowDraft>()
  const [existingProviderEdit, setExistingProviderEdit] = useState<{ id: string; provider: Record<string, unknown> }>()
  const [existingModelEdit, setExistingModelEdit] = useState<{ providerID: string; modelID: string; model: Record<string, unknown> }>()
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
      setProviderListMode("add")
      setRoute("provider-list")
    }
    if (action === "edit-provider") {
      setProviderListMode("edit")
      setRoute("provider-list")
    }
    if (action === "delete-provider") {
      setMessage("This TUI flow is coming in the next wave. Use the CLI command for now.")
    }
  }

  async function openExistingProviderEdit(providerID: string) {
    try {
      const target = config.target ?? locateConfig({ scope: config.scope })
      const document = await readConfig(target)
      const providerMap = isRecord(document.data.provider) ? document.data.provider : {}
      const provider = providerMap[providerID]
      if (!isRecord(provider)) throw new Error(`Provider "${providerID}" does not exist`)
      setExistingProviderEdit({ id: providerID, provider })
      setRoute("provider-edit-existing")
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught))
      setRoute("home")
    }
  }

  async function prepareProviderWriteState(generated: GeneratedProviderDraft): Promise<DiffReviewState> {
    const target = config.target ?? locateConfig({ scope: config.scope })
    const document = await readConfig(target)
    const nextConfig = addProvider(document.data, generated.provider)
    const providerConfig = (nextConfig.provider as Record<string, unknown>)[generated.provider.id]
    const nextText = applyProviderEdit(document, generated.provider.id, providerConfig)
    return {
      targetPath: target.path,
      diff: createConfigDiff(document.target.exists ? document.text : "", nextText),
      document,
      nextConfig,
      nextText,
      secretFile: providerDraft ? { path: providerDraft.apiKeyFilePath, value: providerDraft.apiKeyValue } : undefined,
    }
  }

  async function commitPreparedWrite(review: DiffReviewState): Promise<DiffReviewState> {
    if (!review.document || !review.nextConfig || !review.nextText) return { ...review, error: "No pending write is available." }
    const validation = await validateConfig(review.nextConfig, { relaxModelEnum: true })
    if (validation.diagnostics.length > 0) {
      return { ...review, diagnostics: validation.diagnostics, error: validation.diagnostics.map((diagnostic) => diagnostic.message).join("\n") }
    }

    const secretSnapshot = review.secretFile ? await snapshotSecretFile(review.secretFile.path) : undefined
    let secretFilePath: string | undefined
    try {
      if (review.secretFile) {
        const secretResult = await writeSecretFileSafely(review.secretFile)
        secretFilePath = secretResult.path
      }
      const result = await writeConfigSafely({
        document: review.document,
        nextConfig: review.nextConfig,
        nextText: review.nextText,
        validate: (nextConfig) => validateConfig(nextConfig, { relaxModelEnum: true }),
      })
      if (result.diagnostics.length > 0) {
        if (secretSnapshot) await restoreSecretFile(secretSnapshot)
        return { ...review, diagnostics: result.diagnostics, error: result.diagnostics.map((diagnostic) => diagnostic.message).join("\n") }
      }
      return { ...review, result, secretFilePath, completed: true }
    } catch (caught) {
      if (secretSnapshot) await restoreSecretFile(secretSnapshot)
      return { ...review, error: caught instanceof Error ? caught.message : String(caught) }
    }
  }

  async function saveProvider(generated: GeneratedProviderDraft) {
    try {
      const review = await prepareProviderWriteState(generated)
      setDiffReview(await commitPreparedWrite(review))
      setRoute("diff-review")
    } catch (caught) {
      setDiffReview({ targetPath: "No target selected", diff: createConfigDiff("", ""), error: caught instanceof Error ? caught.message : String(caught) })
      setRoute("diff-review")
    }
  }

  async function reviewProviderDiff(generated: GeneratedProviderDraft) {
    try {
      setDiffReview(await prepareProviderWriteState(generated))
      setRoute("diff-review")
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught))
      setRoute("home")
    }
  }

  async function reviewExistingProviderEdit(providerID: string, draft: ExistingProviderEditDraft) {
    try {
      const target = config.target ?? locateConfig({ scope: config.scope })
      const document = await readConfig(target)
      const providerMap = isRecord(document.data.provider) ? document.data.provider : {}
      const provider = providerMap[providerID]
      if (!isRecord(provider)) throw new Error(`Provider "${providerID}" does not exist`)
      const patch = buildExistingProviderEditPatch(provider, draft)
      const nextConfig = updateProvider(document.data, providerID, patch)
      const providerConfig = (nextConfig.provider as Record<string, unknown>)[providerID]
      const nextText = applyProviderEdit(document, providerID, providerConfig)
      setDiffReview({
        targetPath: target.path,
        diff: createConfigDiff(document.target.exists ? document.text : "", nextText),
        document,
        nextConfig,
        nextText,
      })
      setRoute("diff-review")
    } catch (caught) {
      setDiffReview({ targetPath: "No target selected", diff: createConfigDiff("", ""), error: caught instanceof Error ? caught.message : String(caught) })
      setRoute("diff-review")
    }
  }

  async function openExistingModelEdit(providerID: string, modelID: string) {
    try {
      const target = config.target ?? locateConfig({ scope: config.scope })
      const document = await readConfig(target)
      const providerMap = isRecord(document.data.provider) ? document.data.provider : {}
      const provider = providerMap[providerID]
      if (!isRecord(provider)) throw new Error(`Provider "${providerID}" does not exist`)
      const modelMap = isRecord(provider.models) ? provider.models : {}
      const model = modelMap[modelID]
      if (!isRecord(model)) throw new Error(`Model "${providerID}/${modelID}" does not exist`)
      setExistingModelEdit({ providerID, modelID, model })
      setRoute("model-edit-existing")
    } catch (caught) {
      setDiffReview({ targetPath: "No target selected", diff: createConfigDiff("", ""), error: caught instanceof Error ? caught.message : String(caught) })
      setRoute("diff-review")
    }
  }

  async function reviewExistingModelEdit(providerID: string, modelID: string, draft: ExistingModelEditDraft) {
    try {
      const target = config.target ?? locateConfig({ scope: config.scope })
      const document = await readConfig(target)
      const providerMap = isRecord(document.data.provider) ? document.data.provider : {}
      const provider = providerMap[providerID]
      if (!isRecord(provider)) throw new Error(`Provider "${providerID}" does not exist`)
      const modelMap = isRecord(provider.models) ? provider.models : {}
      const model = modelMap[modelID]
      if (!isRecord(model)) throw new Error(`Model "${providerID}/${modelID}" does not exist`)
      const patch = buildExistingModelEditPatch(model, draft)
      const nextConfig = updateModel(document.data, providerID, modelID, patch)
      const nextProvider = (nextConfig.provider as Record<string, unknown>)[providerID]
      if (!isRecord(nextProvider) || !isRecord(nextProvider.models)) throw new Error(`Model "${providerID}/${modelID}" does not exist`)
      const nextModel = nextProvider.models[modelID]
      const nextText = applyModelEdit(document, providerID, modelID, nextModel)
      setDiffReview({
        targetPath: target.path,
        diff: createConfigDiff(document.target.exists ? document.text : "", nextText),
        document,
        nextConfig,
        nextText,
      })
      setRoute("diff-review")
    } catch (caught) {
      setDiffReview({ targetPath: "No target selected", diff: createConfigDiff("", ""), error: caught instanceof Error ? caught.message : String(caught) })
      setRoute("diff-review")
    }
  }

  async function confirmWrite() {
    setDiffReview(await commitPreparedWrite(diffReview))
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
      {route === "provider-list" ? (
        <ProviderListScreen
          selection={config}
          mode={providerListMode}
          onAdd={() => setRoute("provider-edit")}
          onSelectProvider={(providerID) => void openExistingProviderEdit(providerID)}
          onBack={() => setRoute("home")}
        />
      ) : null}
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
        <ModelEditScreen draft={providerDraft} onBack={() => setRoute("home")} onSave={saveProvider} onReviewDiff={reviewProviderDiff} />
      ) : null}
      {route === "provider-edit-existing" && existingProviderEdit ? (
        <ProviderEditExistingScreen
          providerID={existingProviderEdit.id}
          provider={existingProviderEdit.provider}
          onBack={() => setRoute("home")}
          onEditModels={() => setRoute("model-list")}
          onComplete={(draft) => void reviewExistingProviderEdit(existingProviderEdit.id, draft)}
        />
      ) : null}
      {route === "model-list" && existingProviderEdit ? (
        <ModelListScreen
          selection={config}
          providerID={existingProviderEdit.id}
          onBack={() => setRoute("provider-edit-existing")}
          onSelectModel={(modelID) => void openExistingModelEdit(existingProviderEdit.id, modelID)}
        />
      ) : null}
      {route === "model-edit-existing" && existingModelEdit ? (
        <ModelEditExistingScreen
          providerID={existingModelEdit.providerID}
          modelID={existingModelEdit.modelID}
          model={existingModelEdit.model}
          onBack={() => setRoute("model-list")}
          onComplete={(draft) => void reviewExistingModelEdit(existingModelEdit.providerID, existingModelEdit.modelID, draft)}
        />
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
