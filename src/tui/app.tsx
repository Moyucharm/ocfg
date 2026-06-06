import React, { useEffect, useRef, useState } from "react"
import { Box, useApp } from "ink"
import { applyCompactionSettings, applyCompactionText, type CompactionSettings } from "../core/compaction.js"
import { applyPermissionEdit, applyPermissionText, type PermissionEdit } from "../core/permission-control.js"
import { createConfigDiff } from "../core/diff.js"
import { locateConfig } from "../core/config-locator.js"
import { readConfig } from "../core/config-reader.js"
import { validateConfig } from "../core/schema-validator.js"
import { defaultSecretFilePath, restoreSecretFile, snapshotSecretFile, writeSecretFileSafely } from "../core/secret-file.js"
import { writeConfigSafely } from "../core/config-writer.js"
import { enableExaSearchPermissions, OPENCODE_EXA_ENV } from "../core/search-toggle.js"
import { writeUserEnvVar, type UserEnvWriteResult } from "../core/user-env.js"
import { addModel, addProvider, deleteModel, deleteProvider, findModelReferences, findProviderReferences, updateModel, updateProvider } from "../core/provider-editor.js"
import { disableLocalPlugin, enableLocalPlugin, installLocalPlugin, type LocalPluginItem } from "../core/local-plugin-manager.js"
import { disablePlugin, enablePlugin, updatePluginOptions, type PluginListItem, type PluginOptions } from "../core/plugin-editor.js"
import { applyConfigEdit, applyConfigEdits, applyModelEdit, applyProviderEdit } from "../core/jsonc-editor.js"
import {
  addInstructionRef,
  assessRuleOverwriteRisk,
  deletePromptFileSafely,
  deleteRuleProfileSafely,
  deleteRuleFileSafely,
  instructionRefForPromptFile,
  promptRefForFile,
  readInstructionFile,
  readPromptFile,
  readRuleProfile,
  readRuleFile,
  removeInstructionRef,
  removePromptReferences,
  setAgentPrompt,
  writeInstructionFileSafely,
  writePromptFileSafely,
  writeRuleProfileSafely,
  writeRuleFileSafely,
  type ConfigInstructionItem,
  type PromptFile,
  type PromptTemplate,
  type PromptWriteResult,
  type RuleFile,
  type RuleProfile,
} from "../core/prompt-manager.js"
import { HomeScreen } from "./screens/home.js"
import { SelectConfigScreen } from "./screens/select-config.js"
import { DoctorScreen } from "./screens/doctor.js"
import { DiffReviewScreen } from "./screens/diff-review.js"
import { ProviderListScreen } from "./screens/provider-list.js"
import { ProviderEditScreen } from "./screens/provider-edit.js"
import { ProviderEditExistingScreen } from "./screens/provider-edit-existing.js"
import { PluginAddScreen } from "./screens/plugin-add.js"
import { PluginEditScreen } from "./screens/plugin-edit.js"
import { PluginLocalEditScreen } from "./screens/plugin-local-edit.js"
import { PluginListScreen } from "./screens/plugin-list.js"
import { PromptAddScreen } from "./screens/prompt-add.js"
import { PromptEditScreen, type PromptEditState } from "./screens/prompt-edit.js"
import { PromptModeScreen } from "./screens/prompt-mode.js"
import { PromptListScreen } from "./screens/prompt-list.js"
import { InstructionAddScreen } from "./screens/instruction-add.js"
import { ModelListScreen } from "./screens/model-list.js"
import { ModelEditExistingScreen } from "./screens/model-edit-existing.js"
import { ModelEditScreen } from "./screens/model-edit.js"
import { ModelAddScreen } from "./screens/model-add.js"
import { DeleteConfirmScreen } from "./screens/delete-confirm.js"
import { DefaultModelScreen } from "./screens/default-model.js"
import { CompactionScreen } from "./screens/compaction.js"
import { PermissionsScreen } from "./screens/permissions.js"
import { ToolsScreen } from "./screens/tools.js"
import { ToolsResultScreen } from "./screens/tools-result.js"
import { nextTuiLanguage, TuiI18nProvider, translate, type TuiLanguage } from "./i18n.js"
import { useTuiInput } from "./input.js"
import { buildExistingProviderEditPatch, type ExistingProviderEditDraft } from "./provider-edit-existing.js"
import { buildExistingModelEditPatch, type ExistingModelEditDraft } from "./model-edit-existing.js"
import { applyDefaultModelSelection, applyDefaultModelText, collectDefaultModelOptions, isSelectableDefaultModelRef, type DefaultModelKey } from "./default-model.js"
import { TuiKeybindProvider } from "./keybinds.js"
import { TuiMenuMemoryProvider } from "./menu-memory.js"
import { defaultTuiPreferences, loadTuiPreferences, writeTuiLanguagePreference } from "./preferences.js"
import { TuiThemeProvider } from "./theme.js"
import { OpenCodeBusyDialog, OpenCodeFrame, OpenCodeNotice } from "./ui.js"
import { isRecord } from "../core/object-utils.js"
import type { GeneratedProviderDraft } from "../core/provider-generator.js"
import type { DeleteTargetState, DiffReviewState, PromptListMode, ProviderFlowDraft, ToolsResultState, TuiAction, TuiConfigSelection, TuiRoute } from "./types.js"

export function App() {
  const { exit } = useApp()
  const [route, setRoute] = useState<TuiRoute>("home")
  const routeHistory = useRef<TuiRoute[]>([])
  const [config, setConfig] = useState<TuiConfigSelection>({ scope: "global" })
  const [message, setMessage] = useState<string>()
  const [busyMessage, setBusyMessage] = useState<string>()
  const [toolsRefreshKey, setToolsRefreshKey] = useState(0)
  const [toolsResult, setToolsResult] = useState<ToolsResultState>()
  const [preferenceWarning, setPreferenceWarning] = useState<string>()
  const [preferencePath, setPreferencePath] = useState<string>()
  const [tuiPreferences, setTuiPreferences] = useState(defaultTuiPreferences)
  const [providerDraft, setProviderDraft] = useState<ProviderFlowDraft>()
  const [existingProviderEdit, setExistingProviderEdit] = useState<{ id: string; provider: Record<string, unknown> }>()
  const [existingModelEdit, setExistingModelEdit] = useState<{ providerID: string; modelID: string; model: Record<string, unknown> }>()
  const [selectedPlugin, setSelectedPlugin] = useState<PluginListItem>()
  const [selectedLocalPlugin, setSelectedLocalPlugin] = useState<LocalPluginItem>()
  const [pluginAddKind, setPluginAddKind] = useState<"npm" | "local">("npm")
  const [promptListMode, setPromptListMode] = useState<PromptListMode>("rules")
  const [promptAddKind, setPromptAddKind] = useState<"prompt" | "rule-profile">("prompt")
  const [promptEditState, setPromptEditState] = useState<PromptEditState>()
  const [deleteTarget, setDeleteTarget] = useState<DeleteTargetState>()
  const [diffReturnRoute, setDiffReturnRoute] = useState<TuiRoute>("home")
  const [diffCompletedRoute, setDiffCompletedRoute] = useState<TuiRoute>("home")
  const [diffReview, setDiffReview] = useState<DiffReviewState>({
    targetPath: translate(defaultTuiPreferences.language, "diff.noTargetSelected"),
    diff: createConfigDiff("", ""),
  })
  const languageWriteInFlight = useRef(false)

  function navigate(nextRoute: TuiRoute) {
    if (nextRoute === route) return
    routeHistory.current.push(route)
    setRoute(nextRoute)
  }

  function goBack(fallback: TuiRoute = "home") {
    const previousRoute = routeHistory.current.pop()
    setRoute(previousRoute ?? fallback)
  }

  function completeFlow(nextRoute: TuiRoute) {
    routeHistory.current = []
    setRoute(nextRoute)
  }

  function promptWriteMessage(key: "prompt.saved" | "prompt.deleted" | "prompt.switchedRuleConfig", result: PromptWriteResult) {
    const details = [
      result.preservedPath ? translate(tuiPreferences.language, "prompt.preservedRules", { path: result.preservedPath }) : undefined,
      result.backupPath ? translate(tuiPreferences.language, "prompt.backup", { path: result.backupPath }) : undefined,
    ].filter(Boolean)
    const base = translate(tuiPreferences.language, key, { path: result.path })
    return details.length > 0 ? `${base} ${details.join(" ")}` : base
  }

  async function withBusy<T>(message: string, task: () => Promise<T>) {
    setBusyMessage(message)
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    try {
      return await task()
    } finally {
      setBusyMessage(undefined)
    }
  }

  function withSaving<T>(task: () => Promise<T>) {
    return withBusy(translate(tuiPreferences.language, "common.saving"), task)
  }

  useEffect(() => {
    let active = true
    loadTuiPreferences().then((result) => {
      if (!active) return
      setPreferencePath(result.path)
      setTuiPreferences(result.preferences)
      setPreferenceWarning(result.diagnostics.length > 0 ? result.diagnostics.join(" ") : undefined)
    })
    return () => {
      active = false
    }
  }, [])

  useTuiInput((input, key) => {
    if (key.escape && route === "home") exit()
  })

  function handleHomeAction(action: TuiAction) {
    setMessage(undefined)
    if (action === "switch-config") navigate("select-config")
    if (action === "manage-plugins") navigate("plugin-list")
    if (action === "manage-prompts") navigate("prompt-mode")
    if (action === "tools") navigate("tools")
    if (action === "add-provider") {
      navigate("provider-edit")
    }
    if (action === "edit-provider") {
      navigate("provider-list")
    }
    if (action === "set-default-model") navigate("default-model")
  }

  async function selectLanguage(language: TuiLanguage) {
    if (languageWriteInFlight.current || language === tuiPreferences.language) return
    languageWriteInFlight.current = true
    setMessage(undefined)
    try {
      await writeTuiLanguagePreference(language, preferencePath ? { path: preferencePath } : {})
      setTuiPreferences((current) => ({ ...current, language }))
      setPreferenceWarning(undefined)
      setMessage(translate(language, "language.saved"))
    } catch (caught) {
      setPreferenceWarning(translate(tuiPreferences.language, "language.saveFailed", { message: caught instanceof Error ? caught.message : String(caught) }))
    } finally {
      languageWriteInFlight.current = false
    }
  }

  function toggleLanguage() {
    void selectLanguage(nextTuiLanguage(tuiPreferences.language))
  }

  function openDiffReview(review: DiffReviewState, returnRoute: TuiRoute, completedRoute: TuiRoute = returnRoute) {
    setDiffReturnRoute(returnRoute)
    setDiffCompletedRoute(completedRoute)
    setDiffReview(review)
    navigate("diff-review")
  }

  function closeDiffReview() {
    if (!diffReview.completed) {
      goBack(diffReturnRoute)
      return
    }
    routeHistory.current = []
    setRoute(diffCompletedRoute)
  }

  function envTargetLabel(result: UserEnvWriteResult) {
    return result.targetPath ?? result.command ?? result.variable
  }

  function toolsEnvMessage(base: string) {
    return `${base} ${translate(tuiPreferences.language, "tools.restart")}`
  }

  function openToolsResult(result: ToolsResultState) {
    setToolsResult(result)
    navigate("tools-result")
  }

  function closeToolsResult() {
    goBack("tools")
  }

  function exaSearchConfigText(document: Awaited<ReturnType<typeof readConfig>>, nextConfig: Record<string, unknown>) {
    const changes: { path: (string | number)[]; value: unknown }[] = []
    if (!sameJSON(document.data.$schema, nextConfig.$schema)) changes.push({ path: ["$schema"], value: nextConfig.$schema })
    if (!sameJSON(document.data.permission, nextConfig.permission)) changes.push({ path: ["permission"], value: nextConfig.permission })
    return changes.length > 0 ? applyConfigEdits(document, changes) : document.text || "{}\n"
  }

  async function toggleExaSearch(currentlyEnabled: boolean) {
    setMessage(undefined)
    try {
      await withSaving(async () => {
        if (currentlyEnabled) {
          const envResult = await writeUserEnvVar(OPENCODE_EXA_ENV, "0")
          const base = translate(tuiPreferences.language, "tools.disabledMessage", { envTarget: envTargetLabel(envResult) })
          setToolsRefreshKey((current) => current + 1)
          openToolsResult({ message: toolsEnvMessage(base), tone: "success" })
          return
        }

        const target = config.target ?? locateConfig({ scope: config.scope })
        const document = await readConfig(target)
        if (document.diagnostics.length > 0) throw new Error(document.diagnostics.map((diagnostic) => diagnostic.message).join("\n"))

        const nextConfig = enableExaSearchPermissions(document.data)
        if (!sameJSON(document.data, nextConfig)) {
          const nextText = exaSearchConfigText(document, nextConfig)
          const validation = await validateConfig(nextConfig, { relaxModelEnum: true })
          if (validation.diagnostics.length > 0) throw new Error(validation.diagnostics.map((diagnostic) => diagnostic.message).join("\n"))
          const result = await writeConfigSafely({
            document,
            nextConfig,
            nextText,
            validate: () => validation,
          })
          if (result.diagnostics.length > 0) throw new Error(result.diagnostics.map((diagnostic) => diagnostic.message).join("\n"))
        }

        const envResult = await writeUserEnvVar(OPENCODE_EXA_ENV, "1")
        const base = translate(tuiPreferences.language, "tools.enabledMessage", { configPath: target.path, envTarget: envTargetLabel(envResult) })
        setToolsRefreshKey((current) => current + 1)
        openToolsResult({ message: toolsEnvMessage(base), tone: "success" })
      })
    } catch (caught) {
      openToolsResult({ message: caught instanceof Error ? caught.message : String(caught), tone: "error" })
      setToolsRefreshKey((current) => current + 1)
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
      navigate("provider-edit-existing")
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught))
      setRoute("provider-list")
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
    if (!review.document || !review.nextConfig || !review.nextText) return { ...review, error: translate(tuiPreferences.language, "diff.noPendingWrite") }
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
      let promptFilePath: string | undefined
      if (review.promptFile?.action === "delete") {
        const promptResult = await deletePromptFileSafely(review.promptFile.target, review.promptFile.name)
        promptFilePath = promptResult.path
      }
      return { ...review, result, secretFilePath, promptFilePath, completed: true }
    } catch (caught) {
      if (secretSnapshot) await restoreSecretFile(secretSnapshot)
      return { ...review, error: caught instanceof Error ? caught.message : String(caught) }
    }
  }

  async function saveProvider(generated: GeneratedProviderDraft) {
    try {
      const completedReview = await withSaving(async () => {
        const review = await prepareProviderWriteState(generated)
        return commitPreparedWrite(review)
      })
      setDiffReview(completedReview)
      setDiffReturnRoute("home")
      setDiffCompletedRoute("home")
      navigate("diff-review")
    } catch (caught) {
      setDiffReview({ targetPath: translate(tuiPreferences.language, "diff.noTargetSelected"), diff: createConfigDiff("", ""), error: caught instanceof Error ? caught.message : String(caught) })
      setDiffReturnRoute("home")
      setDiffCompletedRoute("home")
      navigate("diff-review")
    }
  }

  async function reviewProviderDiff(generated: GeneratedProviderDraft) {
    try {
      openDiffReview(await prepareProviderWriteState(generated), "model-edit", "home")
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught))
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
      }, "provider-edit-existing", "provider-list")
    } catch (caught) {
      openDiffReview({ targetPath: translate(tuiPreferences.language, "diff.noTargetSelected"), diff: createConfigDiff("", ""), error: caught instanceof Error ? caught.message : String(caught) }, "provider-edit-existing")
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
      openDiffReview({ targetPath: translate(tuiPreferences.language, "diff.noTargetSelected"), diff: createConfigDiff("", ""), error: caught instanceof Error ? caught.message : String(caught) }, "model-list")
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
      openDiffReview({ targetPath: translate(tuiPreferences.language, "diff.noTargetSelected"), diff: createConfigDiff("", ""), error: caught instanceof Error ? caught.message : String(caught) }, "model-list")
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
      openDiffReview({ targetPath: translate(tuiPreferences.language, "diff.noTargetSelected"), diff: createConfigDiff("", ""), error: caught instanceof Error ? caught.message : String(caught) }, "model-list")
    }
  }

  async function reviewPluginAdd(packageName: string) {
    try {
      const target = config.target ?? locateConfig({ scope: config.scope })
      const document = await readConfig(target)
      const nextConfig = enablePlugin(document.data, packageName)
      const nextText = applyConfigEdit(document, ["plugin"], nextConfig.plugin)
      openDiffReview({
        targetPath: target.path,
        diff: createConfigDiff(document.target.exists ? document.text : "", nextText),
        document,
        nextConfig,
        nextText,
      }, "plugin-add", "plugin-list")
    } catch (caught) {
      openDiffReview({ targetPath: translate(tuiPreferences.language, "diff.noTargetSelected"), diff: createConfigDiff("", ""), error: caught instanceof Error ? caught.message : String(caught) }, "plugin-add")
    }
  }

  async function installLocalPluginFromInput(sourcePath: string) {
    try {
      const result = await withSaving(() => installLocalPlugin(sourcePath, { scope: config.scope }))
      setMessage(translate(tuiPreferences.language, "plugin.localInstalled", { path: result.toPath }))
      completeFlow("plugin-list")
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught))
    }
  }

  async function reviewPluginOptions(packageName: string, options: PluginOptions) {
    try {
      const target = config.target ?? locateConfig({ scope: config.scope })
      const document = await readConfig(target)
      const nextConfig = updatePluginOptions(document.data, packageName, { options })
      const nextText = applyConfigEdit(document, ["plugin"], nextConfig.plugin)
      openDiffReview({
        targetPath: target.path,
        diff: createConfigDiff(document.target.exists ? document.text : "", nextText),
        document,
        nextConfig,
        nextText,
      }, "plugin-edit", "plugin-list")
    } catch (caught) {
      openDiffReview({ targetPath: translate(tuiPreferences.language, "diff.noTargetSelected"), diff: createConfigDiff("", ""), error: caught instanceof Error ? caught.message : String(caught) }, "plugin-edit")
    }
  }

  async function reviewPluginClearOptions(packageName: string) {
    try {
      const target = config.target ?? locateConfig({ scope: config.scope })
      const document = await readConfig(target)
      const nextConfig = updatePluginOptions(document.data, packageName, { clearOptions: true })
      const nextText = applyConfigEdit(document, ["plugin"], nextConfig.plugin)
      openDiffReview({
        targetPath: target.path,
        diff: createConfigDiff(document.target.exists ? document.text : "", nextText),
        document,
        nextConfig,
        nextText,
      }, "plugin-edit", "plugin-list")
    } catch (caught) {
      openDiffReview({ targetPath: translate(tuiPreferences.language, "diff.noTargetSelected"), diff: createConfigDiff("", ""), error: caught instanceof Error ? caught.message : String(caught) }, "plugin-edit")
    }
  }

  async function reviewPluginDisable(packageName: string) {
    try {
      const target = config.target ?? locateConfig({ scope: config.scope })
      const document = await readConfig(target)
      const nextConfig = disablePlugin(document.data, packageName)
      const nextText = applyConfigEdit(document, ["plugin"], nextConfig.plugin)
      openDiffReview({
        targetPath: target.path,
        diff: createConfigDiff(document.target.exists ? document.text : "", nextText),
        document,
        nextConfig,
        nextText,
      }, "plugin-list")
    } catch (caught) {
      openDiffReview({ targetPath: translate(tuiPreferences.language, "diff.noTargetSelected"), diff: createConfigDiff("", ""), error: caught instanceof Error ? caught.message : String(caught) }, "plugin-list")
    }
  }

  async function toggleLocalPlugin(plugin: LocalPluginItem) {
    try {
      await withSaving(() => plugin.status === "enabled" ? disableLocalPlugin(plugin.fileName, { scope: config.scope }) : enableLocalPlugin(plugin.fileName, { scope: config.scope }))
      setMessage(undefined)
      completeFlow("plugin-list")
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught))
    }
  }

  function sameJSON(left: unknown, right: unknown) {
    return JSON.stringify(left) === JSON.stringify(right)
  }

  function promptConfigText(document: Awaited<ReturnType<typeof readConfig>>, nextConfig: Record<string, unknown>) {
    const changes: { path: (string | number)[]; value: unknown }[] = []
    if (!sameJSON(document.data.agent, nextConfig.agent)) changes.push({ path: ["agent"], value: nextConfig.agent })
    if (!sameJSON(document.data.instructions, nextConfig.instructions)) changes.push({ path: ["instructions"], value: nextConfig.instructions })
    return changes.length > 0 ? applyConfigEdits(document, changes) : document.text || "{}\n"
  }

  async function openPromptFile(prompt: PromptFile) {
    try {
      const target = config.target ?? locateConfig({ scope: config.scope })
      const content = await readPromptFile(target, prompt.fileName)
      setPromptEditState({ kind: "file", prompt, content })
      navigate("prompt-edit")
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught))
      setRoute("prompt-list")
    }
  }

  function openPromptTemplate(template: PromptTemplate) {
    setPromptEditState({ kind: "template", template, content: template.content })
    navigate("prompt-edit")
  }

  async function openRuleFile(rule: RuleFile) {
    try {
      const target = config.target ?? locateConfig({ scope: config.scope })
      const content = await readRuleFile(target)
      setPromptEditState({ kind: "rule", rule, content })
      navigate("prompt-edit")
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught))
      setRoute("prompt-list")
    }
  }

  async function openRuleProfile(profile: RuleProfile) {
    try {
      const target = config.target ?? locateConfig({ scope: config.scope })
      const content = await readRuleProfile(target, profile.fileName)
      setPromptEditState({ kind: "rule-profile", profile, content })
      navigate("prompt-edit")
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught))
      setRoute("prompt-list")
    }
  }

  async function openInstructionFile(instruction: ConfigInstructionItem) {
    try {
      const content = instruction.editable ? await readInstructionFile(instruction) : ""
      setPromptEditState({ kind: "instruction", instruction, content })
      navigate("prompt-edit")
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught))
      setRoute("prompt-list")
    }
  }

  async function savePromptContent(fileName: string, content: string) {
    try {
      const target = config.target ?? locateConfig({ scope: config.scope })
      const result = await withSaving(() => writePromptFileSafely(target, fileName, content))
      setMessage(promptWriteMessage("prompt.saved", result))
      completeFlow("prompt-list")
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught))
    }
  }

  async function saveRuleContent(content: string) {
    try {
      const target = config.target ?? locateConfig({ scope: config.scope })
      const result = await withSaving(() => writeRuleFileSafely(target, content))
      setMessage(promptWriteMessage("prompt.saved", result))
      completeFlow("prompt-list")
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught))
    }
  }

  async function saveRuleProfileContent(fileName: string, content: string) {
    try {
      const target = config.target ?? locateConfig({ scope: config.scope })
      const result = await withSaving(() => writeRuleProfileSafely(target, fileName, content))
      setMessage(promptWriteMessage("prompt.saved", result))
      completeFlow("prompt-list")
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught))
    }
  }

  async function updateRuleProfileContent(profile: RuleProfile, content: string) {
    await saveRuleProfileContent(profile.fileName, content)
  }

  async function assessRulesOverwrite(content: string) {
    const target = config.target ?? locateConfig({ scope: config.scope })
    return assessRuleOverwriteRisk(target, content)
  }

  async function applyRulesContent(content: string) {
    try {
      const target = config.target ?? locateConfig({ scope: config.scope })
      const result = await withSaving(() => writeRuleFileSafely(target, content))
      setMessage(promptWriteMessage("prompt.saved", result))
      completeFlow("prompt-list")
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught))
    }
  }

  async function switchRuleProfile(profile: RuleProfile) {
    try {
      const target = config.target ?? locateConfig({ scope: config.scope })
      const result = await withSaving(async () => {
        const content = await readRuleProfile(target, profile.fileName)
        return writeRuleFileSafely(target, content)
      })
      setMessage(promptWriteMessage("prompt.switchedRuleConfig", result))
      completeFlow("prompt-list")
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught))
    }
  }

  async function deleteRuleProfile(profile: RuleProfile) {
    try {
      const target = config.target ?? locateConfig({ scope: config.scope })
      const result = await withSaving(() => deleteRuleProfileSafely(target, profile.fileName))
      setMessage(promptWriteMessage("prompt.deleted", result))
      completeFlow("prompt-list")
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught))
    }
  }

  async function saveInstructionContent(instruction: ConfigInstructionItem, content: string) {
    try {
      const result = await withSaving(() => writeInstructionFileSafely(instruction, content))
      setMessage(promptWriteMessage("prompt.saved", result))
      completeFlow("prompt-list")
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught))
    }
  }

  async function reviewPromptGlobalApply(fileName: string, content: string, shouldWritePrompt: boolean) {
    try {
      const target = config.target ?? locateConfig({ scope: config.scope })
      if (shouldWritePrompt) await withSaving(() => writePromptFileSafely(target, fileName, content, { backup: false }))
      const document = await readConfig(target)
      const nextConfig = addInstructionRef(document.data, instructionRefForPromptFile(fileName, target))
      const nextText = promptConfigText(document, nextConfig)
      openDiffReview({
        targetPath: target.path,
        diff: createConfigDiff(document.target.exists ? document.text : "", nextText),
        document,
        nextConfig,
        nextText,
      }, "prompt-edit", "prompt-list")
    } catch (caught) {
      openDiffReview({ targetPath: translate(tuiPreferences.language, "diff.noTargetSelected"), diff: createConfigDiff("", ""), error: caught instanceof Error ? caught.message : String(caught) }, "prompt-edit")
    }
  }

  async function reviewPromptApply(fileName: string, content: string, agentID: string, shouldWritePrompt: boolean) {
    try {
      const target = config.target ?? locateConfig({ scope: config.scope })
      if (shouldWritePrompt) await withSaving(() => writePromptFileSafely(target, fileName, content, { backup: false }))
      const document = await readConfig(target)
      const nextConfig = setAgentPrompt(document.data, agentID, promptRefForFile(fileName, target), {
        description: `Uses ${fileName}`,
        mode: "primary",
      })
      const nextText = promptConfigText(document, nextConfig)
      openDiffReview({
        targetPath: target.path,
        diff: createConfigDiff(document.target.exists ? document.text : "", nextText),
        document,
        nextConfig,
        nextText,
      }, "prompt-edit", "prompt-list")
    } catch (caught) {
      openDiffReview({ targetPath: translate(tuiPreferences.language, "diff.noTargetSelected"), diff: createConfigDiff("", ""), error: caught instanceof Error ? caught.message : String(caught) }, "prompt-edit")
    }
  }

  async function deletePrompt(prompt: PromptFile) {
    try {
      const target = config.target ?? locateConfig({ scope: config.scope })
      const document = await readConfig(target)
      const nextConfig = removePromptReferences(document.data, prompt.ref, instructionRefForPromptFile(prompt.fileName, target))
      const shouldWriteConfig = !sameJSON(document.data.agent, nextConfig.agent) || !sameJSON(document.data.instructions, nextConfig.instructions)
      if (!shouldWriteConfig) {
        const result = await withSaving(() => deletePromptFileSafely(target, prompt.fileName))
        setMessage(promptWriteMessage("prompt.deleted", result))
        completeFlow("prompt-list")
        return
      }

      const nextText = promptConfigText(document, nextConfig)
      openDiffReview({
        targetPath: target.path,
        diff: createConfigDiff(document.target.exists ? document.text : "", nextText),
        document,
        nextConfig,
        nextText,
        promptFile: {
          action: "delete",
          target,
          name: prompt.fileName,
          path: prompt.path,
        },
      }, "prompt-edit", "prompt-list")
    } catch (caught) {
      openDiffReview({ targetPath: translate(tuiPreferences.language, "diff.noTargetSelected"), diff: createConfigDiff("", ""), error: caught instanceof Error ? caught.message : String(caught) }, "prompt-edit")
    }
  }

  async function deleteRule(rule: RuleFile) {
    try {
      const target = config.target ?? locateConfig({ scope: config.scope })
      const result = await withSaving(() => deleteRuleFileSafely(target))
      setMessage(promptWriteMessage("prompt.deleted", result))
      completeFlow("prompt-list")
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught))
    }
  }

  async function reviewInstructionRemove(instruction: ConfigInstructionItem) {
    try {
      const target = config.target ?? locateConfig({ scope: config.scope })
      const document = await readConfig(target)
      const nextConfig = removeInstructionRef(document.data, instruction.ref)
      const nextText = promptConfigText(document, nextConfig)
      openDiffReview({
        targetPath: target.path,
        diff: createConfigDiff(document.target.exists ? document.text : "", nextText),
        document,
        nextConfig,
        nextText,
      }, "prompt-edit", "prompt-list")
    } catch (caught) {
      openDiffReview({ targetPath: translate(tuiPreferences.language, "diff.noTargetSelected"), diff: createConfigDiff("", ""), error: caught instanceof Error ? caught.message : String(caught) }, "prompt-edit")
    }
  }

  async function reviewInstructionAdd(ref: string) {
    try {
      const target = config.target ?? locateConfig({ scope: config.scope })
      const document = await readConfig(target)
      const nextConfig = addInstructionRef(document.data, ref)
      const nextText = promptConfigText(document, nextConfig)
      openDiffReview({
        targetPath: target.path,
        diff: createConfigDiff(document.target.exists ? document.text : "", nextText),
        document,
        nextConfig,
        nextText,
      }, "instruction-add", "prompt-list")
    } catch (caught) {
      openDiffReview({ targetPath: translate(tuiPreferences.language, "diff.noTargetSelected"), diff: createConfigDiff("", ""), error: caught instanceof Error ? caught.message : String(caught) }, "instruction-add")
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
      setRoute("provider-list")
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
      setDeleteTarget({ ...deleteTarget, error: translate(tuiPreferences.language, "delete.error.confirmToken", { token: expectedToken }) })
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
        }, "provider-list")
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
      openDiffReview({ targetPath: translate(tuiPreferences.language, "diff.noTargetSelected"), diff: createConfigDiff("", ""), error: caught instanceof Error ? caught.message : String(caught) }, "default-model")
    }
  }

  async function reviewCompaction(settings: CompactionSettings) {
    try {
      const target = config.target ?? locateConfig({ scope: config.scope })
      const document = await readConfig(target)
      const nextConfig = applyCompactionSettings(document.data, settings)
      const nextText = applyCompactionText(document, nextConfig)
      openDiffReview({
        targetPath: target.path,
        diff: createConfigDiff(document.target.exists ? document.text : "", nextText),
        document,
        nextConfig,
        nextText,
      }, "compaction", "tools")
    } catch (caught) {
      openDiffReview({ targetPath: translate(tuiPreferences.language, "diff.noTargetSelected"), diff: createConfigDiff("", ""), error: caught instanceof Error ? caught.message : String(caught) }, "compaction")
    }
  }

  async function reviewPermissionEdit(edit: PermissionEdit) {
    try {
      const target = config.target ?? locateConfig({ scope: config.scope })
      const document = await readConfig(target)
      const nextConfig = applyPermissionEdit(document.data, edit)
      if (sameJSON(document.data, nextConfig)) throw new Error(translate(tuiPreferences.language, "permission.noChanges"))
      const nextText = applyPermissionText(document, edit, nextConfig)
      openDiffReview({
        targetPath: target.path,
        diff: createConfigDiff(document.target.exists ? document.text : "", nextText),
        document,
        nextConfig,
        nextText,
      }, "permissions", "tools")
    } catch (caught) {
      openDiffReview({ targetPath: translate(tuiPreferences.language, "diff.noTargetSelected"), diff: createConfigDiff("", ""), error: caught instanceof Error ? caught.message : String(caught) }, "permissions")
    }
  }

  async function confirmWrite() {
    setDiffReview(await withSaving(() => commitPreparedWrite(diffReview)))
  }

  return (
    <TuiThemeProvider themeName={tuiPreferences.theme}>
      <TuiI18nProvider language={tuiPreferences.language}>
        <TuiKeybindProvider keybinds={tuiPreferences.keybinds}>
          <TuiMenuMemoryProvider>
            <OpenCodeFrame>
            <Box flexDirection="column">
              {busyMessage ? <OpenCodeBusyDialog message={busyMessage} /> : (
                <>
                  {message ? <OpenCodeNotice>{message}</OpenCodeNotice> : null}
                  {preferenceWarning ? <OpenCodeNotice>{preferenceWarning}</OpenCodeNotice> : null}
            {route === "home" ? <HomeScreen selection={config} language={tuiPreferences.language} onAction={handleHomeAction} onToggleLanguage={toggleLanguage} onQuit={exit} /> : null}
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
            {route === "tools" ? <ToolsScreen selection={config} refreshKey={toolsRefreshKey} onDoctor={() => navigate("doctor")} onToggleExaSearch={(enabled) => void toggleExaSearch(enabled)} onConfigureCompaction={() => navigate("compaction")} onConfigurePermissions={() => navigate("permissions")} onBack={() => goBack()} /> : null}
            {route === "tools-result" && toolsResult ? <ToolsResultScreen result={toolsResult} onClose={closeToolsResult} /> : null}
            {route === "compaction" ? <CompactionScreen selection={config} onReview={(settings) => void reviewCompaction(settings)} onBack={() => goBack("tools")} /> : null}
            {route === "permissions" ? <PermissionsScreen selection={config} onReview={(edit) => void reviewPermissionEdit(edit)} onBack={() => goBack("tools")} /> : null}
            {route === "provider-list" ? (
              <ProviderListScreen
                selection={config}
                onSelectProvider={(providerID) => void openExistingProviderEdit(providerID)}
                onBack={() => goBack()}
              />
            ) : null}
            {route === "plugin-list" ? (
              <PluginListScreen
                selection={config}
                onInstallNpmPlugin={() => {
                  setPluginAddKind("npm")
                  navigate("plugin-add")
                }}
                onInstallLocalPlugin={() => {
                  setPluginAddKind("local")
                  navigate("plugin-add")
                }}
                onEditPlugin={(plugin) => {
                  setSelectedPlugin(plugin)
                  navigate("plugin-edit")
                }}
                onEditLocalPlugin={(plugin) => {
                  setSelectedLocalPlugin(plugin)
                  navigate("plugin-local-edit")
                }}
                onBack={() => goBack()}
              />
            ) : null}
            {route === "plugin-add" ? (
              <PluginAddScreen
                kind={pluginAddKind}
                onAdd={(value) => void (pluginAddKind === "npm" ? reviewPluginAdd(value) : installLocalPluginFromInput(value))}
                onBack={() => goBack()}
              />
            ) : null}
            {route === "plugin-edit" && selectedPlugin ? (
              <PluginEditScreen
                plugin={selectedPlugin}
                onSaveOptions={(packageName, options) => void reviewPluginOptions(packageName, options)}
                onClearOptions={(packageName) => void reviewPluginClearOptions(packageName)}
                onDisable={(packageName) => void reviewPluginDisable(packageName)}
                onBack={() => goBack()}
              />
            ) : null}
            {route === "plugin-local-edit" && selectedLocalPlugin ? (
              <PluginLocalEditScreen
                plugin={selectedLocalPlugin}
                onToggle={(plugin) => void toggleLocalPlugin(plugin)}
                onBack={() => goBack()}
              />
            ) : null}
            {route === "prompt-mode" ? (
              <PromptModeScreen
                onSelect={(mode) => {
                  setPromptListMode(mode)
                  navigate("prompt-list")
                }}
                onBack={() => goBack()}
              />
            ) : null}
            {route === "prompt-list" ? (
              <PromptListScreen
                selection={config}
                mode={promptListMode}
                onAddPrompt={() => {
                  setPromptAddKind("prompt")
                  navigate("prompt-add")
                }}
                onAddRuleProfile={() => {
                  setPromptAddKind("rule-profile")
                  navigate("prompt-add")
                }}
                onAddInstruction={() => navigate("instruction-add")}
                onSelectRule={(rule) => void openRuleFile(rule)}
                onSelectRuleProfile={(profile) => void openRuleProfile(profile)}
                onSelectInstruction={(instruction) => void openInstructionFile(instruction)}
                onSelectPrompt={(prompt) => void openPromptFile(prompt)}
                onSelectTemplate={openPromptTemplate}
                onBack={() => goBack("prompt-mode")}
              />
            ) : null}
            {route === "prompt-add" ? (
              <PromptAddScreen
                kind={promptAddKind}
                onSave={(fileName, content) => void (promptAddKind === "rule-profile" ? saveRuleProfileContent(fileName, content) : savePromptContent(fileName, content))}
                onBack={() => goBack()}
              />
            ) : null}
            {route === "instruction-add" ? (
              <InstructionAddScreen
                onSave={(ref) => void reviewInstructionAdd(ref)}
                onBack={() => goBack()}
              />
            ) : null}
            {route === "prompt-edit" && promptEditState ? (
              <PromptEditScreen
                state={promptEditState}
                mode={promptListMode}
                onSaveContent={(fileName, content) => void savePromptContent(fileName, content)}
                onSaveRule={(content) => void saveRuleContent(content)}
                onSaveRuleProfile={(profile, content) => void updateRuleProfileContent(profile, content)}
                onSaveInstruction={(instruction, content) => void saveInstructionContent(instruction, content)}
                onAssessRuleOverwriteRisk={(content) => assessRulesOverwrite(content)}
                onApplyRules={(content) => void applyRulesContent(content)}
                onSwitchRuleProfile={(profile) => void switchRuleProfile(profile)}
                onApplyGlobal={(fileName, content, shouldWritePrompt) => void reviewPromptGlobalApply(fileName, content, shouldWritePrompt)}
                onApply={(fileName, content, agentID, shouldWritePrompt) => void reviewPromptApply(fileName, content, agentID, shouldWritePrompt)}
                onDelete={(prompt) => void deletePrompt(prompt)}
                onDeleteRule={(rule) => void deleteRule(rule)}
                onDeleteRuleProfile={(profile) => void deleteRuleProfile(profile)}
                onRemoveInstruction={(instruction) => void reviewInstructionRemove(instruction)}
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
                onDelete={() => void beginProviderDelete(existingProviderEdit.id)}
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
                diffStyle={tuiPreferences.diffStyle}
                onCancel={() => goBack(diffReturnRoute)}
                onClose={closeDiffReview}
                onConfirm={confirmWrite}
              />
            ) : null}
                </>
              )}
            </Box>
            </OpenCodeFrame>
          </TuiMenuMemoryProvider>
        </TuiKeybindProvider>
      </TuiI18nProvider>
    </TuiThemeProvider>
  )
}
