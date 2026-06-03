import React, { useState } from "react"
import { useTuiText } from "../i18n.js"
import { deleteEditableTextInputBackward, deleteEditableTextInputForward, editableTextInput, insertEditableTextInput, moveEditableTextInput, useTuiInput } from "../input.js"
import { matchesKeybind, useTuiKeybinds } from "../keybinds.js"
import type { DeleteTargetState } from "../types.js"
import { OpenCodeMenu, openCodeMenuRows, OpenCodePrompt, type OpenCodeMenuGroup } from "../ui.js"

const actions = ["Confirm", "Cancel"] as const

export function DeleteConfirmScreen(props: {
  target: DeleteTargetState
  onConfirm: (token?: string) => void
  onCancel: () => void
}) {
  const t = useTuiText()
  const [selected, setSelected] = useState(0)
  const [token, setToken] = useState(() => editableTextInput())
  const keybinds = useTuiKeybinds()
  const requiresToken = props.target.references.length > 0
  const targetLabel = props.target.kind === "provider" ? props.target.providerID : `${props.target.providerID}/${props.target.modelID}`
  const kindLabel = t(props.target.kind === "provider" ? "delete.kind.provider" : "delete.kind.model")
  const expectedToken = props.target.kind === "provider" ? `delete:${props.target.providerID}` : `delete:${props.target.providerID}/${props.target.modelID}`
  const groups: OpenCodeMenuGroup[] = [{
    title: t("delete.group"),
    items: actions.map((action) => ({ id: action, label: action === "Confirm" ? t("delete.confirmTarget", { target: targetLabel }) : t("common.cancel"), danger: action === "Confirm" })),
  }]

  function runSelected(index = selected) {
    const item = openCodeMenuRows(groups, "").find((row) => row.kind === "item" && row.itemIndex === index)
    if (item?.kind !== "item") return
    if (item.item.id === "Confirm") props.onConfirm()
    else props.onCancel()
  }

  useTuiInput((input, key) => {
    if (requiresToken) {
      if (matchesKeybind("cancel", input, key, keybinds)) return props.onCancel()
      if (matchesKeybind("left", input, key, keybinds)) setToken((current) => moveEditableTextInput(current, "left"))
      else if (matchesKeybind("right", input, key, keybinds)) setToken((current) => moveEditableTextInput(current, "right"))
      else if (key.backspace) setToken(deleteEditableTextInputBackward)
      else if (key.delete) setToken(deleteEditableTextInputForward)
      else if (matchesKeybind("confirm", input, key, keybinds)) props.onConfirm(token.value.trim())
      else setToken((current) => insertEditableTextInput(current, input))
      return
    }
    if (matchesKeybind("quit", input, key, keybinds) || matchesKeybind("back", input, key, keybinds)) return props.onCancel()
    if (matchesKeybind("up", input, key, keybinds) || matchesKeybind("left", input, key, keybinds)) setSelected((current) => (current === 0 ? actions.length - 1 : current - 1))
    if (matchesKeybind("down", input, key, keybinds) || matchesKeybind("right", input, key, keybinds)) setSelected((current) => (current === actions.length - 1 ? 0 : current + 1))
    if (matchesKeybind("confirm", input, key, keybinds)) runSelected()
  })

  if (requiresToken) {
    return (
      <OpenCodePrompt
        title={t("delete.title", { kind: kindLabel })}
        label={t("delete.typeToken", { token: expectedToken })}
        value={token.value}
        cursor={token.cursor}
        error={props.target.error}
        hint={t("delete.referencedBy", { refs: props.target.references.join(", ") })}
        footer={[`${t("common.continue")}\tenter`, `${t("common.cancel")}\tesc`]}
      />
    )
  }

  return <OpenCodeMenu title={t("delete.title", { kind: kindLabel })} query="" rows={openCodeMenuRows(groups, "")} selectedIndex={selected} footer={[`${t("common.select")}\tenter`, `${t("common.cancel")}\tesc`]} />
}
