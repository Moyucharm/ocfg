import React, { useState } from "react"
import { useTuiText } from "../i18n.js"
import { useOpenCodeMenuInput } from "../menu-input.js"
import type { PromptListMode } from "../types.js"
import { OpenCodeMenu, openCodeMenuRows, type OpenCodeMenuGroup } from "../ui.js"

export function PromptModeScreen(props: {
  onSelect: (mode: PromptListMode) => void
  onBack: () => void
}) {
  const t = useTuiText()
  const [selected, setSelected] = useState(0)
  const groups: OpenCodeMenuGroup[] = [{
    title: t("prompt.actions"),
    items: [
      { id: "rules", label: t("prompt.mode.rules"), detail: t("prompt.mode.rulesDetail") },
      { id: "agent-prompt", label: t("prompt.mode.agentPrompts"), detail: t("prompt.mode.agentPromptsDetail") },
    ],
  }]

  function runSelected(index = selected) {
    const item = openCodeMenuRows(groups, "").find((row) => row.kind === "item" && row.itemIndex === index)
    if (item?.kind === "item") props.onSelect(item.item.id as PromptListMode)
  }

  useOpenCodeMenuInput({ groups, selected, setSelected, onSelect: runSelected, onBack: props.onBack })

  return <OpenCodeMenu title={t("prompt.title")} query="" rows={openCodeMenuRows(groups, "")} selectedIndex={selected} footer={[`${t("common.open")}\tenter`, `${t("common.back")}\tesc`]} />
}
