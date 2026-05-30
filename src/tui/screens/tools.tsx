import React, { useEffect, useState } from "react"
import { Text } from "ink"
import { locateConfig } from "../../core/config-locator.js"
import { readConfig } from "../../core/config-reader.js"
import { isExaSearchEnabled } from "../../core/search-toggle.js"
import { useTuiText } from "../i18n.js"
import { useOpenCodeMenuInput } from "../menu-input.js"
import type { TuiConfigSelection } from "../types.js"
import { OpenCodeMenu, openCodeMenuRows, type OpenCodeMenuGroup } from "../ui.js"

export function ToolsScreen(props: {
  selection: TuiConfigSelection
  refreshKey: number
  onToggleExaSearch: (enabled: boolean) => void
  onBack: () => void
}) {
  const t = useTuiText()
  const [selected, setSelected] = useState(0)
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [targetPath, setTargetPath] = useState("")

  const groups: OpenCodeMenuGroup[] = [{
    title: t("tools.group"),
    items: [{
      id: "exa-search",
      label: t("tools.exaSearch"),
      description: targetPath,
      detail: t("tools.exaSearchDetail"),
      meta: t(enabled ? "tools.enabled" : "tools.disabled"),
      tone: enabled ? "success" : "danger",
    }],
  }]

  function selectIndex(index = selected) {
    if (loading || error) return
    const item = openCodeMenuRows(groups, "").find((row) => row.kind === "item" && row.itemIndex === index)
    if (item?.kind !== "item") return
    props.onToggleExaSearch(enabled)
  }

  useOpenCodeMenuInput({ groups, selected, setSelected, onSelect: selectIndex, onBack: props.onBack, mouse: { hasFooter: true, hasDetail: true } })

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setError(undefined)
      try {
        const target = props.selection.target ?? locateConfig({ scope: props.selection.scope })
        const document = await readConfig(target)
        if (!active) return
        setTargetPath(target.path)
        setEnabled(isExaSearchEnabled(document.data))
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
  }, [props.selection, props.refreshKey])

  if (loading) return <Text>{t("tools.loading")}</Text>
  if (error) return <Text color="red">{t("tools.failed", { message: error })}</Text>

  return <OpenCodeMenu title={t("tools.title")} query="" rows={openCodeMenuRows(groups, "")} selectedIndex={selected} footer={[`${t("common.back")}\tesc`, `${t("common.toggle")}\tenter`]} />
}
