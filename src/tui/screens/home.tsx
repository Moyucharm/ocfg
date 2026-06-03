import React, { useState } from "react"
import { Box, Text } from "ink"
import { useTuiText, type TuiLanguage } from "../i18n.js"
import { useTuiInput } from "../input.js"
import { useOpenCodeMenuInput } from "../menu-input.js"
import { useTuiTheme } from "../theme.js"
import type { TuiAction, TuiConfigSelection } from "../types.js"
import { OpenCodeMenu, openCodeMenuRows, type OpenCodeMenuGroup } from "../ui.js"

function LanguageSegment(props: { active: boolean; label: string }) {
  const theme = useTuiTheme()
  return (
    <Text
      backgroundColor={props.active ? theme.colors.highlight : theme.colors.background}
      color={props.active ? theme.colors.highlightText : theme.colors.primary}
      bold={props.active}
    >
      {props.label}
    </Text>
  )
}

function HomeLanguageToggle(props: { language: TuiLanguage }) {
  const theme = useTuiTheme()
  return (
    <Box>
      <Text color={theme.colors.border}>[</Text>
      <LanguageSegment active={props.language === "en"} label=" EN " />
      <Text color={theme.colors.border}>|</Text>
      <LanguageSegment active={props.language === "zh-CN"} label=" 中 " />
      <Text color={theme.colors.border}>]</Text>
      <Text> </Text>
      <Text color={theme.colors.shortcut}>TAB</Text>
    </Box>
  )
}

export function HomeScreen(props: {
  selection: TuiConfigSelection
  language: TuiLanguage
  onAction: (action: TuiAction) => void
  onToggleLanguage: () => void
  onQuit: () => void
}) {
  const t = useTuiText()
  const [selected, setSelected] = useState(0)
  const groups: OpenCodeMenuGroup[] = [
    {
      title: t("home.group.commands"),
      items: [
        { id: "edit-provider", label: t("home.editProvider") },
        { id: "add-provider", label: t("home.connectProvider") },
        { id: "manage-plugins", label: t("home.managePlugins") },
        { id: "manage-prompts", label: t("home.managePrompts") },
        { id: "doctor", label: t("home.doctor") },
        { id: "set-default-model", label: t("home.setDefaultModel") },
        { id: "tools", label: t("home.tools") },
        { id: "switch-config", label: t("home.switchConfig") },
      ],
    },
  ]

  function runSelected(index = selected) {
    const item = openCodeMenuRows(groups, "").find((row) => row.kind === "item" && row.itemIndex === index)
    if (item?.kind === "item") props.onAction(item.item.id as TuiAction)
  }

  useTuiInput((_input, key) => {
    if (key.tab) props.onToggleLanguage()
  })

  useOpenCodeMenuInput({ groups, selected, setSelected, onSelect: runSelected, onQuit: props.onQuit })

  return (
    <OpenCodeMenu
      title={t("home.title")}
      query=""
      rows={openCodeMenuRows(groups, "")}
      selectedIndex={selected}
      footer={[`${t("common.select")}\tenter`, `${t("common.exit")}\tq`]}
      footerRight={<HomeLanguageToggle language={props.language} />}
    />
  )
}
