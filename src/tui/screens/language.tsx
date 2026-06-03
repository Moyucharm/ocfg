import React, { useState } from "react"
import type { TuiLanguage } from "../i18n.js"
import { useTuiText } from "../i18n.js"
import { useOpenCodeMenuInput } from "../menu-input.js"
import { OpenCodeMenu, openCodeMenuRows, type OpenCodeMenuGroup } from "../ui.js"

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

  useOpenCodeMenuInput({ groups, selected, setSelected, onSelect: selectIndex, onBack: props.onBack })

  return <OpenCodeMenu title={t("language.title")} query="" rows={openCodeMenuRows(groups, "")} selectedIndex={selected} footer={[`${t("common.back")}\tesc`, `${t("common.select")}\tenter`]} />
}
