import React, { useState } from "react"
import type { LocalPluginItem } from "../../core/local-plugin-manager.js"
import { useTuiText } from "../i18n.js"
import { useOpenCodeMenuInput } from "../menu-input.js"
import { OpenCodeMenu, openCodeMenuRows, type OpenCodeMenuGroup } from "../ui.js"

export function PluginLocalEditScreen(props: {
  plugin: LocalPluginItem
  onToggle: (plugin: LocalPluginItem) => void
  onBack: () => void
}) {
  const t = useTuiText()
  const [selected, setSelected] = useState(0)
  const isEnabled = props.plugin.status === "enabled"

  const groups: OpenCodeMenuGroup[] = [{
    title: t("plugin.localPlugin"),
    items: [{
      id: "toggle",
      label: t(isEnabled ? "plugin.disable" : "plugin.enable"),
      description: props.plugin.fileName,
      meta: t(isEnabled ? "plugin.enabled" : "plugin.disabled"),
      detail: props.plugin.path,
      tone: isEnabled ? "danger" : "success",
    }],
  }]

  function runSelected(index = selected) {
    const item = openCodeMenuRows(groups, "").find((row) => row.kind === "item" && row.itemIndex === index)
    if (item?.kind === "item" && item.item.id === "toggle") props.onToggle(props.plugin)
  }

  useOpenCodeMenuInput({ groups, selected, setSelected, onSelect: runSelected, onBack: props.onBack, wheel: true, mouse: { hasFooter: true, hasDetail: true } })

  return (
    <OpenCodeMenu
      title={t("plugin.title.editId", { id: props.plugin.fileName })}
      query=""
      rows={openCodeMenuRows(groups, "")}
      selectedIndex={selected}
      footer={[`${t("common.select")}\tenter`, `${t("common.back")}\tesc`]}
    />
  )
}
