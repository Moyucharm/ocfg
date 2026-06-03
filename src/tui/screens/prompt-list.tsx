import React, { useEffect, useState } from "react"
import { Text } from "ink"
import { locateConfig } from "../../core/config-locator.js"
import { readConfig } from "../../core/config-reader.js"
import {
  defaultPromptTemplates,
  listConfigInstructionItems,
  listPromptFiles,
  listRuleProfiles,
  listRuleFiles,
  type ConfigInstructionItem,
  type PromptFile,
  type PromptTemplate,
  type RuleFile,
  type RuleProfile,
} from "../../core/prompt-manager.js"
import { useTuiText } from "../i18n.js"
import { useTuiInput } from "../input.js"
import { matchesKeybind, useTuiKeybinds } from "../keybinds.js"
import type { TuiConfigSelection } from "../types.js"
import { OpenCodeMenu, openCodeMenuRows, type OpenCodeMenuGroup } from "../ui.js"

export function PromptListScreen(props: {
  selection: TuiConfigSelection
  onAddPrompt: () => void
  onAddRuleProfile: () => void
  onSelectRule: (rule: RuleFile) => void
  onSelectRuleProfile: (profile: RuleProfile) => void
  onSelectInstruction: (instruction: ConfigInstructionItem) => void
  onSelectPrompt: (prompt: PromptFile) => void
  onSelectTemplate: (template: PromptTemplate) => void
  onBack: () => void
}) {
  const t = useTuiText()
  const [rules, setRules] = useState<RuleFile[]>([])
  const [ruleProfiles, setRuleProfiles] = useState<RuleProfile[]>([])
  const [instructions, setInstructions] = useState<ConfigInstructionItem[]>([])
  const [prompts, setPrompts] = useState<PromptFile[]>([])
  const [selected, setSelected] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const keybinds = useTuiKeybinds()

  const installedTemplateNames = new Set(prompts.map((prompt) => prompt.fileName))
  const groups: OpenCodeMenuGroup[] = [
    {
      title: t("prompt.actions"),
      items: [
        { id: "__add", label: t("prompt.add") },
        { id: "__add_rule_profile", label: t("prompt.addRuleConfig") },
      ],
    },
    {
      title: t("prompt.ruleFiles"),
      items: rules.map((rule) => ({
        id: `rule:${rule.kind}`,
        label: rule.title,
        description: rule.fileName,
        meta: rule.exists ? t("prompt.loaded") : t("common.missing"),
        tone: rule.exists ? "success" : "muted",
        detail: rule.description ?? rule.path,
      })),
    },
    {
      title: t("prompt.ruleProfiles"),
      items: ruleProfiles.map((profile) => ({
        id: `rule-profile:${profile.fileName}`,
        label: profile.title,
        description: profile.fileName,
        meta: profile.active ? t("common.current") : t("prompt.available"),
        tone: profile.active ? "success" : undefined,
        detail: profile.description ?? profile.path,
      })),
    },
    {
      title: t("prompt.configInstructions"),
      items: instructions.map((instruction) => ({
        id: `instruction:${instruction.ref}`,
        label: instruction.title,
        description: instruction.kind,
        meta: instruction.kind === "file" ? instruction.exists ? t("prompt.loaded") : t("common.missing") : instruction.kind,
        tone: instruction.kind === "file" && instruction.exists ? "success" : instruction.editable ? undefined : "muted",
        detail: instruction.description ?? instruction.path ?? instruction.ref,
      })),
    },
    {
      title: t("prompt.files"),
      items: prompts.map((prompt) => ({
        id: `file:${prompt.fileName}`,
        label: prompt.title,
        description: prompt.fileName,
        meta: prompt.instructionRefs.length > 0
          ? t("prompt.globalInstruction")
          : prompt.activeAgents.length > 0 ? t("prompt.activeAgents", { agents: prompt.activeAgents.join(", ") }) : t("prompt.available"),
        tone: prompt.instructionRefs.length > 0 || prompt.activeAgents.length > 0 ? "success" : undefined,
        detail: prompt.description ?? prompt.path,
      })),
    },
    {
      title: t("prompt.templates"),
      items: defaultPromptTemplates.map((template) => ({
        id: `template:${template.id}`,
        label: template.title,
        description: template.id,
        meta: installedTemplateNames.has(template.fileName) ? t("prompt.installed") : t("prompt.defaultTemplate"),
        detail: template.description,
      })),
    },
  ]

  function selectedItem(index = selected) {
    return openCodeMenuRows(groups, "").find((row) => row.kind === "item" && row.itemIndex === index)
  }

  function runSelected(index = selected) {
    const item = selectedItem(index)
    if (item?.kind !== "item") return
    if (item.item.id === "__add") {
      props.onAddPrompt()
      return
    }
    if (item.item.id === "__add_rule_profile") {
      props.onAddRuleProfile()
      return
    }
    if (item.item.id.startsWith("rule:")) {
      const rule = rules[0]
      if (rule) props.onSelectRule(rule)
      return
    }
    if (item.item.id.startsWith("rule-profile:")) {
      const fileName = item.item.id.slice("rule-profile:".length)
      const profile = ruleProfiles.find((candidate) => candidate.fileName === fileName)
      if (profile) props.onSelectRuleProfile(profile)
      return
    }
    if (item.item.id.startsWith("instruction:")) {
      const ref = item.item.id.slice("instruction:".length)
      const instruction = instructions.find((candidate) => candidate.ref === ref)
      if (instruction) props.onSelectInstruction(instruction)
      return
    }
    if (item.item.id.startsWith("file:")) {
      const fileName = item.item.id.slice("file:".length)
      const prompt = prompts.find((candidate) => candidate.fileName === fileName)
      if (prompt) props.onSelectPrompt(prompt)
      return
    }
    if (item.item.id.startsWith("template:")) {
      const templateID = item.item.id.slice("template:".length)
      const template = defaultPromptTemplates.find((candidate) => candidate.id === templateID)
      const installed = template ? prompts.find((prompt) => prompt.fileName === template.fileName) : undefined
      if (installed) props.onSelectPrompt(installed)
      else if (template) props.onSelectTemplate(template)
    }
  }

  useTuiInput((input, key) => {
    const rows = openCodeMenuRows(groups, "")
    const count = rows.filter((row) => row.kind === "item").length
    if (matchesKeybind("quit", input, key, keybinds) || matchesKeybind("back", input, key, keybinds)) {
      props.onBack()
      return
    }
    if (matchesKeybind("up", input, key, keybinds)) setSelected((current) => (current === 0 ? Math.max(0, count - 1) : current - 1))
    if (matchesKeybind("down", input, key, keybinds)) setSelected((current) => (current === count - 1 ? 0 : current + 1))
    if (matchesKeybind("confirm", input, key, keybinds)) runSelected()
  })

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setError(undefined)
      try {
        const target = props.selection.target ?? locateConfig({ scope: props.selection.scope })
        const document = await readConfig(target)
        const nextRules = await listRuleFiles(target)
        const nextRuleProfiles = await listRuleProfiles(target)
        const nextInstructions = await listConfigInstructionItems(target, document.data)
        const nextPrompts = await listPromptFiles(target, document.data)
        if (!active) return
        setRules(nextRules)
        setRuleProfiles(nextRuleProfiles)
        setInstructions(nextInstructions)
        setPrompts(nextPrompts)
        setSelected((current) => Math.min(current, Math.max(0, 2 + nextRules.length + nextRuleProfiles.length + nextInstructions.length + nextPrompts.length + defaultPromptTemplates.length - 1)))
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

  if (loading) return <Text>{t("prompt.loading")}</Text>
  if (error) return <Text color="red">{t("prompt.failed", { message: error })}</Text>

  return <OpenCodeMenu title={t("prompt.title")} query="" rows={openCodeMenuRows(groups, "")} selectedIndex={selected} footer={[`${t("common.open")}\tenter`, `${t("common.back")}\tesc`]} />
}
