import React, { useEffect, useState } from "react"
import { Text } from "ink"
import { locateConfig } from "../../core/config-locator.js"
import { readConfig } from "../../core/config-reader.js"
import { collectDefaultModelOptions, type DefaultModelKey, type DefaultModelOption } from "../default-model.js"
import { useTuiText } from "../i18n.js"
import { useTuiInput } from "../input.js"
import { matchesKeybind, useTuiKeybinds } from "../keybinds.js"
import { parseTuiMouseEvent } from "../mouse.js"
import type { TuiConfigSelection } from "../types.js"
import { menuItemIndexFromMouse, OpenCodeMenu, openCodeMenuRows, type OpenCodeMenuGroup } from "../ui.js"

type Step = "target" | "model"

function currentValue(config: Record<string, unknown>, key: DefaultModelKey) {
  return typeof config[key] === "string" ? config[key] : undefined
}

export function DefaultModelScreen(props: {
  selection: TuiConfigSelection
  onSelect: (key: DefaultModelKey, ref?: string) => void
  onBack: () => void
}) {
  const t = useTuiText()
  const [step, setStep] = useState<Step>("target")
  const [selected, setSelected] = useState(0)
  const [targetIndex, setTargetIndex] = useState(0)
  const [options, setOptions] = useState<DefaultModelOption[]>([])
  const [current, setCurrent] = useState<Record<DefaultModelKey, string | undefined>>({ model: undefined, small_model: undefined })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const keybinds = useTuiKeybinds()
  const targets: Array<{ key: DefaultModelKey; label: string; description: string }> = [
    { key: "model", label: t("defaultModel.main"), description: t("defaultModel.mainDesc") },
    { key: "small_model", label: t("defaultModel.small"), description: t("defaultModel.smallDesc") },
  ]

  const selectedTarget = targets[targetIndex]!
  const groups: OpenCodeMenuGroup[] = step === "target"
    ? [{ title: t("defaultModel.setting"), items: targets.map((target) => ({ id: target.key, label: target.label, description: target.description, meta: current[target.key] ?? t("common.empty") })) }]
    : [{ title: options.length > 1 ? t("defaultModel.configured") : t("defaultModel.recent"), items: options.map((option) => ({ id: option.ref ?? "__empty", label: option.ref ? option.label : t("common.empty"), description: option.ref ? option.description : t("defaultModel.clear"), meta: option.ref === current[selectedTarget.key] ? t("common.current") : "" })) }]

  function runSelected(index = selected) {
    const item = openCodeMenuRows(groups, "").find((row) => row.kind === "item" && row.itemIndex === index)
    if (item?.kind !== "item") return
    if (step === "target") {
      const nextIndex = Math.max(0, targets.findIndex((target) => target.key === item.item.id))
      setTargetIndex(nextIndex)
      setSelected(0)
      setStep("model")
      return
    }
    props.onSelect(selectedTarget.key, item.item.id === "__empty" ? undefined : item.item.id)
  }

  useTuiInput((input, key) => {
    const rows = openCodeMenuRows(groups, "")
    const count = rows.filter((row) => row.kind === "item").length
    const mouse = parseTuiMouseEvent(input)
    if (mouse) {
      if (mouse.kind === "wheel") setSelected((value) => mouse.button === "wheel-up" ? Math.max(0, value - 1) : Math.min(Math.max(0, count - 1), value + 1))
      const clicked = menuItemIndexFromMouse(mouse, rows, { selectedIndex: selected, hasFooter: true })
      if (clicked !== undefined) {
        setSelected(clicked)
        runSelected(clicked)
      }
      return
    }
    if (matchesKeybind("quit", input, key, keybinds) || matchesKeybind("back", input, key, keybinds)) {
      if (step === "model") {
        setStep("target")
        setSelected(targetIndex)
      } else props.onBack()
      return
    }
    if (loading || error) return
    if (matchesKeybind("up", input, key, keybinds) || matchesKeybind("left", input, key, keybinds)) setSelected((value) => (value === 0 ? Math.max(0, count - 1) : value - 1))
    if (matchesKeybind("down", input, key, keybinds) || matchesKeybind("right", input, key, keybinds)) setSelected((value) => (value === count - 1 ? 0 : value + 1))
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
        if (!active) return
        setOptions(collectDefaultModelOptions(document.data))
        setCurrent({ model: currentValue(document.data, "model"), small_model: currentValue(document.data, "small_model") })
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

  if (loading) return <Text>{t("defaultModel.loading")}</Text>
  if (error) return <Text color="red">{t("defaultModel.failed", { message: error })}</Text>

  return <OpenCodeMenu title={step === "target" ? t("defaultModel.title.default") : t("defaultModel.title.model")} query="" rows={openCodeMenuRows(groups, "")} selectedIndex={selected} footer={step === "model" ? [`${t("common.back")}\tesc`, `${t("common.select")}\tenter`] : [`${t("common.back")}\tesc`]} />
}
