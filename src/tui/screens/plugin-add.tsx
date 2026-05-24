import React, { useState } from "react"
import { normalizePluginPackage } from "../../core/plugin-editor.js"
import { useTuiText } from "../i18n.js"
import { appendPrintableInput, useTuiInput } from "../input.js"
import { matchesKeybind, useTuiKeybinds } from "../keybinds.js"
import { OpenCodePrompt } from "../ui.js"

export function PluginAddScreen(props: {
  kind: "npm" | "local"
  onAdd: (value: string) => void
  onBack: () => void
}) {
  const t = useTuiText()
  const [value, setValue] = useState("")
  const [error, setError] = useState<string>()
  const keybinds = useTuiKeybinds()

  function save() {
    try {
      const nextValue = props.kind === "npm" ? normalizePluginPackage(value) : value.trim()
      if (!nextValue) throw new Error(t("plugin.localPathRequired"))
      props.onAdd(nextValue)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }

  useTuiInput((input, key) => {
    if (matchesKeybind("cancel", input, key, keybinds) || matchesKeybind("back", input, key, keybinds)) {
      props.onBack()
      return
    }
    if (key.backspace || key.delete) setValue((current) => current.slice(0, -1))
    else if (matchesKeybind("confirm", input, key, keybinds)) save()
    else {
      setError(undefined)
      setValue((current) => appendPrintableInput(current, input))
    }
  })

  return (
    <OpenCodePrompt
      title={props.kind === "npm" ? t("plugin.installNpm") : t("plugin.installLocal")}
      label={props.kind === "npm" ? t("plugin.package") : t("plugin.localPath")}
      value={value}
      error={error}
      hint={props.kind === "npm" ? t("plugin.packageHint") : t("plugin.localPathHint")}
      footer={[`${t("common.save")}\tenter`, `${t("common.cancel")}\tesc`]}
    />
  )
}
