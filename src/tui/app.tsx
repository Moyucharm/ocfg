import React, { useRef, useState } from "react"
import { Box, Text, useApp, useInput } from "ink"
import { createConfigDiff } from "../core/diff.js"
import { locateConfig } from "../core/config-locator.js"
import { readConfig } from "../core/config-reader.js"
import { validateConfig } from "../core/schema-validator.js"
import { defaultSecretFilePath, restoreSecretFile, snapshotSecretFile, writeSecretFileSafely } from "../core/secret-file.js"
import { writeConfigSafely } from "../core/config-writer.js"
import { addModel, addProvider, deleteModel, deleteProvider, findModelReferences, findProviderReferences, updateModel, updateProvider } from "../core/provider-editor.js"
import { applyConfigEdit, applyModelEdit, applyProviderEdit } from "../core/jsonc-editor.js"
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
import { ModelAddScreen } from "./screens/model-add.js"
import { DeleteConfirmScreen } from "./screens/delete-confirm.js"
import { DefaultModelScreen } from "./screens/default-model.js"
import { buildExistingProviderEditPatch, type ExistingProviderEditDraft } from "./provider-edit-existing.js"
import { buildExistingModelEditPatch, type ExistingModelEditDraft } from "./model-edit-existing.js"
import { applyDefaultModelSelection, applyDefaultModelText, collectDefaultModelOptions, isSelectableDefaultModelRef, type DefaultModelKey } from "./default-model.js"
import type { GeneratedProviderDraft } from "../core/provider-generator.js"
import type { DeleteTargetState, DiffReviewState, ProviderFlowDraft, ProviderListMode, TuiAction, TuiConfigSelection, TuiRoute } from "./types.js"

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

export function App() {
  const { exit } = useApp()
  const [route, setRoute] = useState<TuiRoute>("home")
  const routeHistory = useRef<TuiRoute[]>([])
  const [config, setConfig] = useState<TuiConfigSelection>({ scope: "global" })
  const [message, setMessage] = useState<string>()
  const [providerListMode, setProviderListMode] = useState<ProviderListMode>("add")
  const [providerDraft, setProviderDraft] = useState<ProviderFlowDraft>()
  const [existingProviderEdit, setExistingProviderEdit] = useState<{ id: string; provider: Record<string, unknown> }>()
  const [existingModelEdit, setExistingModelEdit] = useState<{ providerID: string; modelID: string; model: Record<string, unknown> }>()
  const [deleteTarget, setDeleteTarget] = useState<DeleteTargetState>()
  const [diffReturnRoute, setDiffReturnRoute] = useState<TuiRoute>("home")
  const [diffReview, setDiffReview] = useState<DiffReviewState>({
    targetPath: "No target selected",
    diff: createConfigDiff("", ""),
  })

  function navigate(nextRoute: TuiRoute) {
    if (nextRoute === route) return
    routeHistory.current.push(route)
    setRoute(nextRoute)
  }

  function goBack(fallback: TuiRoute = "home") {
    const previousRoute = routeHistory.current.pop()
    setRoute(previousRoute ?? fallback)
  }

  useInput((_input, key) => {
    if (key.escape) {
      if (route === "home") exit()
      else goBack()
    }
  })

  function handleHomeAction(action: TuiAction) {
    setMessage(undefined)
    if (action === "doctor") navigate("doctor")
    if (action === "switch-config") navigate("select-config")
    if (action === "add-provider") {
      setProviderListMode("add")
      navigate("provider-list")
    }
    if (action === "edit-provider") {
      setProviderListMode("edit")
      navigate("provider-list")
    }
    if (action === "delete-provider") {
      setProviderListMode("delete")
      navigate("provider-list")
    }
    if (action === "set-default-model") navigate("default-model")
  }

  function openDiffReview(review: DiffReviewState, returnRoute: TuiRoute) {
    setDiffReturnRoute(returnRoute)
    setDiffReview(review)
    navigate("diff-review")
  }

  function closeCompletedDiffReview() {
    routeHistory.current = []
    setRoute("home")
  }

  async function openExistingProviderEdit(providerID: string) {
    try {
      const target = config.target ?? locateConfig({ scope: config.scope })
      const document = await readConfig(target)
      const providerMap = isRecord(document.data.provider) ? document.data.provider : {}
      const provider = providerMap[providerID]
      if (!isRecord(provider)) throw new Error(`Provider "${providerID}" does not exist`)
      setExistingProviderEdit({ id: providerID, provider })
      navigate("provider-edit-existing")
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught))
      setRoute("home")
    }
  }

  async function openModelAdd(providerID: string) {
    try {
      const target = config.target ?? locateConfig({ scope: config.scope })
      const document = await readConfig(target)
      const providerMap = isRecord(document.data.provider) ? document.data.provider : {}
      const provider = providerMap[providerID]
      if (!isRecord(provider)) throw new Error(`Provider "${providerID}" does not exist`)
      setExistingProviderEdit({ id: providerID, provider })
      navigate("model-add")
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught))
      setRoute("model-list")
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
      setDiffReturnRoute("home")
      navigate("diff-review")
    } catch (caught) {
      setDiffReview({ targetPath: "No target selected", diff: createConfigDiff("", ""), error: caught instanceof Error ? caught.message : String(caught) })
      setDiffReturnRoute("home")
      navigate("diff-review")
    }
  }

  async function reviewProviderDiff(generated: GeneratedProviderDraft) {
    try {
      openDiffReview(await prepareProviderWriteState(generated), "model-edit")
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
      const patch = buildExistingProviderEditPatch(provider, draft, providerID)
      const nextConfig = updateProvider(document.data, providerID, patch)
      const providerConfig = (nextConfig.provider as Record<string, unknown>)[providerID]
      const nextText = applyProviderEdit(document, providerID, providerConfig)
      openDiffReview({
        targetPath: target.path,
        diff: createConfigDiff(document.target.exists ? document.text : "", nextText),
        document,
        nextConfig,
        nextText,
        secretFile: draft.apiKeyValue ? { path: defaultSecretFilePath(providerID), value: draft.apiKeyValue } : undefined,
      }, "provider-edit-existing")
    } catch (caught) {
      openDiffReview({ targetPath: "No target selected", diff: createConfigDiff("", ""), error: caught instanceof Error ? caught.message : String(caught) }, "provider-edit-existing")
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
      navigate("model-edit-existing")
    } catch (caught) {
      openDiffReview({ targetPath: "No target selected", diff: createConfigDiff("", ""), error: caught instanceof Error ? caught.message : String(caught) }, "model-list")
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
      openDiffReview({
        targetPath: target.path,
        diff: createConfigDiff(document.target.exists ? document.text : "", nextText),
        document,
        nextConfig,
        nextText,
      }, "model-list")
    } catch (caught) {
      openDiffReview({ targetPath: "No target selected", diff: createConfigDiff("", ""), error: caught instanceof Error ? caught.message : String(caught) }, "model-list")
    }
  }

  async function reviewAddedModels(providerID: string, generated: GeneratedProviderDraft) {
    try {
      const target = config.target ?? locateConfig({ scope: config.scope })
      const document = await readConfig(target)
      let nextConfig = document.data
      for (const [modelID, model] of Object.entries(generated.provider.models)) {
        nextConfig = addModel(nextConfig, providerID, modelID, model)
      }
      const nextProvider = (nextConfig.provider as Record<string, unknown>)[providerID]
      if (!isRecord(nextProvider) || !isRecord(nextProvider.models)) throw new Error(`Provider "${providerID}" does not exist`)
      const nextText = applyConfigEdit(document, ["provider", providerID, "models"], nextProvider.models)
      openDiffReview({
        targetPath: target.path,
        diff: createConfigDiff(document.target.exists ? document.text : "", nextText),
        document,
        nextConfig,
        nextText,
      }, "model-list")
    } catch (caught) {
      openDiffReview({ targetPath: "No target selected", diff: createConfigDiff("", ""), error: caught instanceof Error ? caught.message : String(caught) }, "model-list")
    }
  }

  async function beginProviderDelete(providerID: string) {
    try {
      const target = config.target ?? locateConfig({ scope: config.scope })
      const document = await readConfig(target)
      const providerMap = isRecord(document.data.provider) ? document.data.provider : {}
      const provider = providerMap[providerID]
      if (!isRecord(provider)) throw new Error(`Provider "${providerID}" does not exist`)
      setDeleteTarget({ kind: "provider", providerID, references: findProviderReferences(document.data, providerID) })
      navigate("delete-confirm")
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught))
      setRoute("home")
    }
  }

  async function beginModelDelete(providerID: string, modelID: string) {
    try {
      const target = config.target ?? locateConfig({ scope: config.scope })
      const document = await readConfig(target)
      const providerMap = isRecord(document.data.provider) ? document.data.provider : {}
      const provider = providerMap[providerID]
      if (!isRecord(provider)) throw new Error(`Provider "${providerID}" does not exist`)
      const modelMap = isRecord(provider.models) ? provider.models : {}
      const model = modelMap[modelID]
      if (!isRecord(model)) throw new Error(`Model "${providerID}/${modelID}" does not exist`)
      setDeleteTarget({ kind: "model", providerID, modelID, references: findModelReferences(document.data, providerID, modelID) })
      navigate("delete-confirm")
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught))
      setRoute("model-list")
    }
  }

  async function confirmDelete(token?: string) {
    if (!deleteTarget) return
    const expectedToken = deleteTarget.kind === "provider" ? `delete:${deleteTarget.providerID}` : `delete:${deleteTarget.providerID}/${deleteTarget.modelID}`
    if (deleteTarget.references.length > 0 && token !== expectedToken) {
      setDeleteTarget({ ...deleteTarget, error: `Confirmation token must be exactly "${expectedToken}"` })
      return
    }

    try {
      const target = config.target ?? locateConfig({ scope: config.scope })
      const document = await readConfig(target)
      if (deleteTarget.kind === "provider") {
        const nextConfig = deleteProvider(document.data, deleteTarget.providerID, { confirmReferencedDelete: token })
        const nextText = applyConfigEdit(document, ["provider", deleteTarget.providerID], undefined)
        openDiffReview({
          targetPath: target.path,
          diff: createConfigDiff(document.target.exists ? document.text : "", nextText),
          document,
          nextConfig,
          nextText,
        }, "home")
        return
      }

      const nextConfig = deleteModel(document.data, deleteTarget.providerID, deleteTarget.modelID, { confirmReferencedDelete: token })
      const nextText = applyConfigEdit(document, ["provider", deleteTarget.providerID, "models", deleteTarget.modelID], undefined)
      openDiffReview({
        targetPath: target.path,
        diff: createConfigDiff(document.target.exists ? document.text : "", nextText),
        document,
        nextConfig,
        nextText,
      }, "model-list")
    } catch (caught) {
      setDeleteTarget({ ...deleteTarget, error: caught instanceof Error ? caught.message : String(caught) })
    }
  }

  async function reviewDefaultModelSelection(key: DefaultModelKey, ref?: string) {
    try {
      const target = config.target ?? locateConfig({ scope: config.scope })
      const document = await readConfig(target)
      const options = collectDefaultModelOptions(document.data)
      if (ref !== undefined && !isSelectableDefaultModelRef(options, ref)) throw new Error(`Model ref "${ref}" does not exist in this config`)
      const nextConfig = applyDefaultModelSelection(document.data, key, ref)
      const nextText = applyDefaultModelText(document, nextConfig, key, ref)
      openDiffReview({
        targetPath: target.path,
        diff: createConfigDiff(document.target.exists ? document.text : "", nextText),
        document,
        nextConfig,
        nextText,
      }, "default-model")
    } catch (caught) {
      openDiffReview({ targetPath: "No target selected", diff: createConfigDiff("", ""), error: caught instanceof Error ? caught.message : String(caught) }, "default-model")
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
            goBack()
          }}
          onBack={() => goBack()}
        />
      ) : null}
      {route === "doctor" ? <DoctorScreen selection={config} onBack={() => goBack()} /> : null}
      {route === "provider-list" ? (
        <ProviderListScreen
          selection={config}
          mode={providerListMode}
          onAdd={() => navigate("provider-edit")}
          onSelectProvider={(providerID) => void (providerListMode === "delete" ? beginProviderDelete(providerID) : openExistingProviderEdit(providerID))}
          onBack={() => goBack()}
        />
      ) : null}
      {route === "provider-edit" ? (
        <ProviderEditScreen
          onBack={() => goBack()}
          onComplete={(draft) => {
            setProviderDraft(draft)
            navigate("model-edit")
          }}
        />
      ) : null}
      {route === "model-edit" && providerDraft ? (
        <ModelEditScreen draft={providerDraft} onBack={() => goBack()} onSave={saveProvider} onReviewDiff={reviewProviderDiff} />
      ) : null}
      {route === "provider-edit-existing" && existingProviderEdit ? (
        <ProviderEditExistingScreen
          providerID={existingProviderEdit.id}
          provider={existingProviderEdit.provider}
          onBack={() => goBack()}
          onEditModels={() => navigate("model-list")}
          onComplete={(draft) => void reviewExistingProviderEdit(existingProviderEdit.id, draft)}
        />
      ) : null}
      {route === "model-list" && existingProviderEdit ? (
        <ModelListScreen
          selection={config}
          providerID={existingProviderEdit.id}
          onAddModel={() => void openModelAdd(existingProviderEdit.id)}
          onBack={() => goBack()}
          onSelectModel={(modelID) => void openExistingModelEdit(existingProviderEdit.id, modelID)}
          onDeleteModel={(modelID) => void beginModelDelete(existingProviderEdit.id, modelID)}
        />
      ) : null}
      {route === "model-add" && existingProviderEdit ? (
        <ModelAddScreen
          providerID={existingProviderEdit.id}
          provider={existingProviderEdit.provider}
          onBack={() => goBack()}
          onReviewDiff={(generated) => void reviewAddedModels(existingProviderEdit.id, generated)}
        />
      ) : null}
      {route === "model-edit-existing" && existingModelEdit ? (
        <ModelEditExistingScreen
          providerID={existingModelEdit.providerID}
          modelID={existingModelEdit.modelID}
          model={existingModelEdit.model}
          onBack={() => goBack()}
          onComplete={(draft) => void reviewExistingModelEdit(existingModelEdit.providerID, existingModelEdit.modelID, draft)}
        />
      ) : null}
      {route === "delete-confirm" && deleteTarget ? (
        <DeleteConfirmScreen
          target={deleteTarget}
          onCancel={() => goBack()}
          onConfirm={(token) => void confirmDelete(token)}
        />
      ) : null}
      {route === "default-model" ? (
        <DefaultModelScreen
          selection={config}
          onBack={() => goBack()}
          onSelect={(key, ref) => void reviewDefaultModelSelection(key, ref)}
        />
      ) : null}
      {route === "diff-review" ? (
        <DiffReviewScreen
          review={diffReview}
          onCancel={() => goBack(diffReturnRoute)}
          onClose={closeCompletedDiffReview}
          onConfirm={confirmWrite}
        />
      ) : null}
    </Box>
  )
}
