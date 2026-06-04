import React, { useState } from "react"
import { useTuiText } from "../i18n.js"
import { deleteEditableTextInputBackward, deleteEditableTextInputForward, editableTextInput, insertEditableTextInput, isBackwardDeleteInput, isForwardDeleteInput, moveEditableTextInput, useTuiInput } from "../input.js"
import { matchesKeybind, useTuiKeybinds } from "../keybinds.js"
import { OpenCodePrompt } from "../ui.js"

export function InstructionAddScreen(props: {
  onSave: (ref: string) => void
  onBack: () => void
}) {
  const t = useTuiText()
  const [ref, setRef] = useState(() => editableTextInput())
  const [error, setError] = useState<string>()
  const keybinds = useTuiKeybinds()

  function save() {
    const value = ref.value.trim()
    if (!value) {
      setError(t("prompt.instructionRefRequired"))
      return
    }
    props.onSave(value)
  }

  useTuiInput((input, key) => {
    if (matchesKeybind("cancel", input, key, keybinds) || matchesKeybind("back", input, key, keybinds)) {
      props.onBack()
      return
    }
    if (matchesKeybind("left", input, key, keybinds)) setRef((current) => moveEditableTextInput(current, "left"))
    else if (matchesKeybind("right", input, key, keybinds)) setRef((current) => moveEditableTextInput(current, "right"))
    else if (isBackwardDeleteInput(input, key)) setRef(deleteEditableTextInputBackward)
    else if (isForwardDeleteInput(input, key)) setRef(deleteEditableTextInputForward)
    else if (matchesKeybind("confirm", input, key, keybinds)) save()
    else {
      setError(undefined)
      setRef((current) => insertEditableTextInput(current, input))
    }
  })

  return (
    <OpenCodePrompt
      title={t("prompt.mode.instructions")}
      label={t("prompt.instructionRef")}
      value={ref.value}
      cursor={ref.cursor}
      error={error}
      hint={t("prompt.instructionRefHint")}
      footer={[`${t("common.save")}\tenter`, `${t("common.cancel")}\tesc`]}
    />
  )
}
