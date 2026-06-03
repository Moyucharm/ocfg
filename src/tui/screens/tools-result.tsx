import React from "react"
import { Box, Text } from "ink"
import { useTuiText } from "../i18n.js"
import { useTuiInput } from "../input.js"
import { matchesKeybind, useTuiKeybinds } from "../keybinds.js"
import { useTuiTheme } from "../theme.js"
import type { ToolsResultState } from "../types.js"
import { formatOpenCodeTitle, OpenCodeActionLine } from "../ui.js"

export function ToolsResultScreen(props: {
  result: ToolsResultState
  onClose: () => void
}) {
  const t = useTuiText()
  const theme = useTuiTheme()
  const keybinds = useTuiKeybinds()
  const color = props.result.tone === "error" ? theme.colors.error : props.result.tone === "success" ? theme.colors.success : theme.colors.warning

  useTuiInput((input, key) => {
    if (matchesKeybind("confirm", input, key, keybinds) || matchesKeybind("quit", input, key, keybinds) || matchesKeybind("back", input, key, keybinds)) props.onClose()
  })

  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between" paddingX={5}>
        <Text bold>{formatOpenCodeTitle(t("tools.title"))}</Text>
        <Text color={theme.colors.shortcut}>esc</Text>
      </Box>
      <Text> </Text>
      <Box paddingX={5}>
        <Text color={color} wrap="wrap">{props.result.message}</Text>
      </Box>
      <Text> </Text>
      <OpenCodeActionLine item={{ id: "ok", label: t("common.ok") }} selected />
      <Text> </Text>
      <Box paddingX={5} gap={3}>
        <Text bold>{t("common.ok")}<Text color={theme.colors.shortcut}> enter</Text></Text>
        <Text bold>{t("common.back")}<Text color={theme.colors.shortcut}> esc/q</Text></Text>
      </Box>
    </Box>
  )
}
