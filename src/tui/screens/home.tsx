import React, { useState } from "react"
import { useTuiText } from "../i18n.js"
import { useOpenCodeMenuInput } from "../menu-input.js"
import type { TuiAction, TuiConfigSelection } from "../types.js"
import { OpenCodeMenu, openCodeMenuRows, type OpenCodeMenuGroup } from "../ui.js"

export function HomeScreen(props: { selection: TuiConfigSelection; onAction: (action: TuiAction) => void; onQuit: () => void }) {
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
        { id: "switch-config", label: t("home.switchConfig") },
        { id: "switch-language", label: t("home.switchLanguage") },
        { id: "delete-provider", label: t("home.deleteProvider"), danger: true },
      ],
    },
  ]

  function runSelected(index = selected) {
    const item = openCodeMenuRows(groups, "").find((row) => row.kind === "item" && row.itemIndex === index)
    if (item?.kind === "item") props.onAction(item.item.id as TuiAction)
  }

  useOpenCodeMenuInput({ groups, selected, setSelected, onSelect: runSelected, onQuit: props.onQuit, wheel: true, mouse: { hasFooter: true } })

  return (
    <OpenCodeMenu
      title={t("home.title")}
      query=""
      rows={openCodeMenuRows(groups, "")}
      selectedIndex={selected}
      footer={[`${t("common.select")}\tenter`, `${t("common.exit")}\tq`]}
    />
  )
}
