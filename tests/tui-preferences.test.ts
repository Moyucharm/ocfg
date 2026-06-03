import { describe, expect, test } from "vitest"
import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { parse } from "jsonc-parser"
import { defaultTuiPreferences, resolveTuiPreferences, writeTuiLanguagePreference } from "../src/tui/preferences.js"

describe("TUI preferences", () => {
  test("returns defaults for missing config", () => {
    const result = resolveTuiPreferences(undefined)

    expect(result.preferences).toBe(defaultTuiPreferences)
    expect(result.diagnostics).toEqual([])
  })

  test("accepts theme, diff style, language, and keybind overrides", () => {
    const result = resolveTuiPreferences({
      theme: "system",
      diffStyle: "compact",
      language: "zh-CN",
      keybinds: { quit: "ctrl+k" },
    })

    expect(result.preferences.theme).toBe("system")
    expect(result.preferences.diffStyle).toBe("compact")
    expect(result.preferences.language).toBe("zh-CN")
    expect(result.preferences.keybinds.quit).toEqual(["ctrl+k"])
    expect(result.diagnostics).toEqual([])
  })

  test("reports invalid theme, diff style, and language while keeping safe defaults", () => {
    const result = resolveTuiPreferences({ theme: "neon", diffStyle: "side-by-side", language: "fr" })

    expect(result.preferences.theme).toBe(defaultTuiPreferences.theme)
    expect(result.preferences.diffStyle).toBe(defaultTuiPreferences.diffStyle)
    expect(result.preferences.language).toBe(defaultTuiPreferences.language)
    expect(result.diagnostics).toHaveLength(3)
  })

  test("reports unsupported legacy mouse preference", () => {
    const result = resolveTuiPreferences({ theme: "neon", diffStyle: "side-by-side", mouse: "yes", language: "fr" })

    expect(result.preferences.theme).toBe(defaultTuiPreferences.theme)
    expect(result.preferences.diffStyle).toBe(defaultTuiPreferences.diffStyle)
    expect(result.preferences.language).toBe(defaultTuiPreferences.language)
    expect(result.preferences).not.toHaveProperty("mouse")
    expect(result.diagnostics).toHaveLength(4)
    expect(result.diagnostics).toContain("TUI mouse preference is no longer supported; ignoring it.")
  })

  test("creates a TUI config file when saving language", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "ocfg-tui-pref-"))
    const filePath = path.join(dir, "nested", "tui.jsonc")

    await writeTuiLanguagePreference("zh-CN", { path: filePath })

    expect(parse(await readFile(filePath, "utf8")).language).toBe("zh-CN")
  })

  test("updates language while preserving existing JSONC fields", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "ocfg-tui-pref-"))
    const filePath = path.join(dir, "tui.jsonc")
    await writeFile(filePath, `{
  // keep theme
  "theme": "system",
  "diffStyle": "compact"
}
`, "utf8")

    await writeTuiLanguagePreference("zh-CN", { path: filePath })

    const text = await readFile(filePath, "utf8")
    const parsed = parse(text)
    expect(text).toContain("// keep theme")
    expect(parsed.theme).toBe("system")
    expect(parsed.diffStyle).toBe("compact")
    expect(parsed.language).toBe("zh-CN")
  })
})
