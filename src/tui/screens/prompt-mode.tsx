import React from "react"
import { useTuiText } from "../i18n.js"
import { useRememberedOpenCodeMenuSelection } from "../menu-memory.js"
import { useOpenCodeMenuInput } from "../menu-input.js"
import type { PromptListMode } from "../types.js"
import { OpenCodeMenu, openCodeMenuRows, type OpenCodeMenuGroup } from "../ui.js"

export function PromptModeScreen(props: {
  onSelect: (mode: PromptListMode) => void
  onBack: () => void
}) {
  const t = useTuiText()
  const groups: OpenCodeMenuGroup[] = [{
    title: t("prompt.actions"),
    items: [
      { id: "rules", label: t("prompt.mode.rules"), detail: t("prompt.mode.rulesDetail") },
      { id: "instructions", label: t("prompt.mode.instructions"), detail: t("prompt.mode.instructionsDetail") },
      { id: "agent-prompt", label: t("prompt.mode.agentPrompts"), detail: t("prompt.mode.agentPromptsDetail") },
    ],
  }]
  const { selected, setSelected, rememberSelected } = useRememberedOpenCodeMenuSelection({ memoryKey: "prompt-mode", groups })

  function runSelected(index = selected) {
    const item = openCodeMenuRows(groups, "").find((row) => row.kind === "item" && row.itemIndex === index)
    if (item?.kind === "item") {
      rememberSelected(index)
      props.onSelect(item.item.id as PromptListMode)
    }
  }

  useOpenCodeMenuInput({ groups, selected, setSelected, onSelect: runSelected, onBack: props.onBack })

  return <OpenCodeMenu title={t("prompt.title")} query="" rows={openCodeMenuRows(groups, "")} selectedIndex={selected} footer={[`${t("common.open")}\tenter`, `${t("common.back")}\tesc`]} />
}
