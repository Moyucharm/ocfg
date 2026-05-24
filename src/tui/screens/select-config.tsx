import React, { useState } from "react"
import { locateConfig } from "../../core/config-locator.js"
import type { ConfigScope } from "../../core/types.js"
import { useTuiText } from "../i18n.js"
import { useOpenCodeMenuInput } from "../menu-input.js"
import type { TuiConfigSelection } from "../types.js"
import { OpenCodeMenu, openCodeMenuRows, type OpenCodeMenuGroup } from "../ui.js"

const scopes: ConfigScope[] = ["global", "project"]

export function SelectConfigScreen(props: {
  selection: TuiConfigSelection
  onSelect: (selection: TuiConfigSelection) => void
  onBack: () => void
}) {
  const t = useTuiText()
  const [selected, setSelected] = useState(() => Math.max(0, scopes.indexOf(props.selection.scope)))
  const groups: OpenCodeMenuGroup[] = [{
    title: t("config.group"),
    items: scopes.map((scope) => {
      const target = locateConfig({ scope })
      return { id: scope, label: t(scope === "global" ? "config.global" : "config.project"), description: target.path, meta: target.exists ? "" : t("common.missing") }
    }),
  }]

  function selectIndex(index = selected) {
    const item = openCodeMenuRows(groups, "").find((row) => row.kind === "item" && row.itemIndex === index)
    if (item?.kind !== "item") return
    const scope = item.item.id as ConfigScope
    props.onSelect({ scope, target: locateConfig({ scope }) })
  }

  useOpenCodeMenuInput({ groups, selected, setSelected, onSelect: selectIndex, onBack: props.onBack, mouse: { hasFooter: true } })

  return <OpenCodeMenu title={t("config.title")} query="" rows={openCodeMenuRows(groups, "")} selectedIndex={selected} footer={[`${t("common.back")}\tesc`, `${t("common.select")}\tenter`]} />
}
