import React, { useState } from "react"
import { normalizePluginPackage } from "../../core/plugin-editor.js"
import { useTuiText } from "../i18n.js"
import { deleteEditableTextInputBackward, deleteEditableTextInputForward, editableTextInput, insertEditableTextInput, moveEditableTextInput, useTuiInput } from "../input.js"
import { matchesKeybind, useTuiKeybinds } from "../keybinds.js"
import { OpenCodePrompt } from "../ui.js"

export function PluginAddScreen(props: {
  kind: "npm" | "local"
  onAdd: (value: string) => void
  onBack: () => void
}) {
  const t = useTuiText()
  const [value, setValue] = useState(() => editableTextInput())
  const [error, setError] = useState<string>()
  const keybinds = useTuiKeybinds()

  function save() {
    try {
      const nextValue = props.kind === "npm" ? normalizePluginPackage(value.value) : value.value.trim()
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
    if (matchesKeybind("left", input, key, keybinds)) setValue((current) => moveEditableTextInput(current, "left"))
    else if (matchesKeybind("right", input, key, keybinds)) setValue((current) => moveEditableTextInput(current, "right"))
    else if (key.backspace) setValue(deleteEditableTextInputBackward)
    else if (key.delete) setValue(deleteEditableTextInputForward)
    else if (matchesKeybind("confirm", input, key, keybinds)) save()
    else {
      setError(undefined)
      setValue((current) => insertEditableTextInput(current, input))
    }
  })

  return (
    <OpenCodePrompt
      title={props.kind === "npm" ? t("plugin.installNpm") : t("plugin.installLocal")}
      label={props.kind === "npm" ? t("plugin.package") : t("plugin.localPath")}
      value={value.value}
      cursor={value.cursor}
      error={error}
      hint={props.kind === "npm" ? t("plugin.packageHint") : t("plugin.localPathHint")}
      footer={[`${t("common.save")}\tenter`, `${t("common.cancel")}\tesc`]}
    />
  )
}
