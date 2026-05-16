import React, { useState } from "react"
import type { TuiLanguage } from "../i18n.js"
import { useTuiText } from "../i18n.js"
import { useTuiInput } from "../input.js"
import { matchesKeybind, useTuiKeybinds } from "../keybinds.js"
import { parseTuiMouseEvent } from "../mouse.js"
import { menuItemIndexFromMouse, OpenCodeMenu, openCodeMenuRows, type OpenCodeMenuGroup } from "../ui.js"

const languages: Array<{ id: TuiLanguage; labelKey: "language.english" | "language.chinese" }> = [
  { id: "en", labelKey: "language.english" },
  { id: "zh-CN", labelKey: "language.chinese" },
]

export function LanguageScreen(props: {
  currentLanguage: TuiLanguage
  onSelect: (language: TuiLanguage) => void
  onBack: () => void
}) {
  const t = useTuiText()
  const [selected, setSelected] = useState(() => Math.max(0, languages.findIndex((language) => language.id === props.currentLanguage)))
  const keybinds = useTuiKeybinds()
  const groups: OpenCodeMenuGroup[] = [{
    title: t("language.group"),
    items: languages.map((language) => ({
      id: language.id,
      label: t(language.labelKey),
      meta: language.id === props.currentLanguage ? t("common.current") : "",
    })),
  }]

  function selectIndex(index = selected) {
    const item = openCodeMenuRows(groups, "").find((row) => row.kind === "item" && row.itemIndex === index)
    if (item?.kind !== "item") return
    props.onSelect(item.item.id as TuiLanguage)
  }

  useTuiInput((input, key) => {
    const rows = openCodeMenuRows(groups, "")
    const count = rows.filter((row) => row.kind === "item").length
    const mouse = parseTuiMouseEvent(input)
    if (mouse) {
      const clicked = menuItemIndexFromMouse(mouse, rows, { selectedIndex: selected, hasFooter: true })
      if (clicked !== undefined) {
        setSelected(clicked)
        selectIndex(clicked)
      }
      return
    }
    if (matchesKeybind("quit", input, key, keybinds) || matchesKeybind("back", input, key, keybinds)) props.onBack()
    if (matchesKeybind("up", input, key, keybinds)) setSelected((current) => (current === 0 ? Math.max(0, count - 1) : current - 1))
    if (matchesKeybind("down", input, key, keybinds)) setSelected((current) => (current === count - 1 ? 0 : current + 1))
    if (matchesKeybind("confirm", input, key, keybinds)) selectIndex()
  })

  return <OpenCodeMenu title={t("language.title")} query="" rows={openCodeMenuRows(groups, "")} selectedIndex={selected} footer={[`${t("common.back")}\tesc`, `${t("common.select")}\tenter`]} />
}
