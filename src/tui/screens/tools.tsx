import React, { useEffect, useState } from "react"
import { Text } from "ink"
import { readCompactionSettings, type CompactionSettings } from "../../core/compaction.js"
import { locateConfig } from "../../core/config-locator.js"
import { readConfig } from "../../core/config-reader.js"
import { isRecord } from "../../core/object-utils.js"
import { isExaSearchEnabled } from "../../core/search-toggle.js"
import { useTuiText } from "../i18n.js"
import { useRememberedOpenCodeMenuSelection } from "../menu-memory.js"
import { useOpenCodeMenuInput } from "../menu-input.js"
import type { TuiConfigSelection } from "../types.js"
import { OpenCodeMenu, openCodeMenuRows, useDelayedLoading, type OpenCodeMenuGroup } from "../ui.js"

export function ToolsScreen(props: {
  selection: TuiConfigSelection
  refreshKey: number
  onDoctor: () => void
  onToggleExaSearch: (enabled: boolean) => void
  onConfigureCompaction: () => void
  onConfigurePermissions: () => void
  onBack: () => void
}) {
  const t = useTuiText()
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [compaction, setCompaction] = useState<CompactionSettings>(() => readCompactionSettings({}))
  const [permissionSummary, setPermissionSummary] = useState("")
  const compactionSummary = `auto=${compaction.auto}, prune=${compaction.prune}, reserved=${compaction.reserved}`

  const groups: OpenCodeMenuGroup[] = [{
    title: t("tools.group"),
    items: [
      {
        id: "doctor",
        label: t("tools.doctor"),
        detail: t("tools.doctorDetail"),
      },
      {
        id: "exa-search",
        label: t("tools.exaSearch"),
        detail: t("tools.exaSearchDetail"),
        meta: t(enabled ? "tools.enabled" : "tools.disabled"),
        tone: enabled ? "success" : "danger",
      },
      {
        id: "compaction",
        label: t("tools.compaction"),
        detail: t("tools.compactionDetail"),
        meta: compactionSummary,
      },
      {
        id: "permissions",
        label: t("tools.permission"),
        detail: t("tools.permissionDetail"),
        meta: permissionSummary,
      },
    ],
  }]
  const { selected, setSelected, rememberSelected } = useRememberedOpenCodeMenuSelection({
    memoryKey: `tools:${props.selection.target?.path ?? props.selection.scope}`,
    groups,
    ready: !loading && !error,
  })

  function selectIndex(index = selected) {
    if (loading || error) return
    const item = openCodeMenuRows(groups, "").find((row) => row.kind === "item" && row.itemIndex === index)
    if (item?.kind !== "item") return
    rememberSelected(index)
    if (item.item.id === "doctor") {
      props.onDoctor()
      return
    }
    if (item.item.id === "compaction") {
      props.onConfigureCompaction()
      return
    }
    if (item.item.id === "permissions") {
      props.onConfigurePermissions()
      return
    }
    props.onToggleExaSearch(enabled)
  }

  useOpenCodeMenuInput({ groups, selected, setSelected, onSelect: selectIndex, onBack: props.onBack })

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setError(undefined)
      try {
        const target = props.selection.target ?? locateConfig({ scope: props.selection.scope })
        const document = await readConfig(target)
        if (!active) return
        setEnabled(isExaSearchEnabled(document.data))
        setCompaction(readCompactionSettings(document.data))
        const agents = isRecord(document.data.agent) ? document.data.agent : {}
        const agentPermissionCount = Object.values(agents).filter((agent) => isRecord(agent) && agent.permission !== undefined).length
        setPermissionSummary(`global=${document.data.permission === undefined ? t("permission.default") : t("permission.configured")}, agents=${agentPermissionCount}`)
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

  const showLoading = useDelayedLoading(loading)

  if (loading) return showLoading ? <Text>{t("tools.loading")}</Text> : null
  if (error) return <Text color="red">{t("tools.failed", { message: error })}</Text>

  return <OpenCodeMenu title={t("tools.title")} query="" rows={openCodeMenuRows(groups, "")} selectedIndex={selected} footer={[`${t("common.back")}\tesc`, `${t("common.select")}\tenter`]} />
}
