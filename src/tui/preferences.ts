import { mkdir, readFile, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { applyEdits, modify, parse, type ParseError } from "jsonc-parser"
import { isRecord } from "../core/object-utils.js"
import { defaultTuiLanguage, isTuiLanguage, type TuiLanguage } from "./i18n.js"
import { isTuiThemeName, type TuiThemeName } from "./theme.js"
import { defaultTuiKeybinds, resolveTuiKeybinds, type TuiKeybindMap } from "./keybinds.js"

export type TuiDiffStyle = "unified" | "compact"

export type TuiPreferences = {
  theme: TuiThemeName
  keybinds: TuiKeybindMap
  diffStyle: TuiDiffStyle
  language: TuiLanguage
}

export type TuiPreferencesResult = {
  preferences: TuiPreferences
  diagnostics: string[]
}

export type LoadedTuiPreferences = TuiPreferencesResult & {
  path: string
}

export const defaultTuiPreferences: TuiPreferences = {
  theme: "opencode",
  keybinds: defaultTuiKeybinds,
  diffStyle: "unified",
  language: defaultTuiLanguage,
}

function resolveDiffStyle(value: unknown, diagnostics: string[]): TuiDiffStyle {
  if (value === undefined) return defaultTuiPreferences.diffStyle
  if (value === "unified" || value === "compact") return value
  diagnostics.push(`Unknown TUI diffStyle "${String(value)}"; using "${defaultTuiPreferences.diffStyle}".`)
  return defaultTuiPreferences.diffStyle
}

function resolveThemeName(value: unknown, diagnostics: string[]): TuiThemeName {
  if (value === undefined) return defaultTuiPreferences.theme
  if (isTuiThemeName(value)) return value
  diagnostics.push(`Unknown TUI theme "${String(value)}"; using "${defaultTuiPreferences.theme}".`)
  return defaultTuiPreferences.theme
}

function resolveLanguage(value: unknown, diagnostics: string[]): TuiLanguage {
  if (value === undefined) return defaultTuiPreferences.language
  if (isTuiLanguage(value)) return value
  diagnostics.push(`Unknown TUI language "${String(value)}"; using "${defaultTuiPreferences.language}".`)
  return defaultTuiPreferences.language
}

export function defaultTuiConfigPath() {
  return path.join(os.homedir(), ".config", "ocfg", "tui.jsonc")
}

export function resolveTuiPreferences(value: unknown): TuiPreferencesResult {
  const diagnostics: string[] = []
  if (!isRecord(value)) {
    if (value !== undefined) diagnostics.push("TUI config must be a JSON object; using defaults.")
    return { preferences: defaultTuiPreferences, diagnostics }
  }
  if (value.mouse !== undefined) diagnostics.push("TUI mouse preference is no longer supported; ignoring it.")

  return {
    preferences: {
      theme: resolveThemeName(value.theme, diagnostics),
      keybinds: resolveTuiKeybinds(value.keybinds),
      diffStyle: resolveDiffStyle(value.diffStyle, diagnostics),
      language: resolveLanguage(value.language, diagnostics),
    },
    diagnostics,
  }
}

export async function loadTuiPreferences(options: { path?: string } = {}): Promise<LoadedTuiPreferences> {
  const configPath = options.path ?? process.env.OCFG_TUI_CONFIG ?? defaultTuiConfigPath()

  try {
    const text = await readFile(configPath, "utf8")
    const parseErrors: ParseError[] = []
    const parsed = parse(text, parseErrors, { allowTrailingComma: true })
    if (parseErrors.length > 0) {
      return {
        path: configPath,
        preferences: defaultTuiPreferences,
        diagnostics: [`Failed to parse TUI config at ${configPath}; using defaults.`],
      }
    }
    return { path: configPath, ...resolveTuiPreferences(parsed) }
  } catch (caught) {
    if (caught && typeof caught === "object" && "code" in caught && caught.code === "ENOENT") {
      return { path: configPath, preferences: defaultTuiPreferences, diagnostics: [] }
    }
    return {
      path: configPath,
      preferences: defaultTuiPreferences,
      diagnostics: [`Failed to read TUI config at ${configPath}: ${caught instanceof Error ? caught.message : String(caught)}`],
    }
  }
}

export async function writeTuiLanguagePreference(language: TuiLanguage, options: { path?: string } = {}) {
  const configPath = options.path ?? process.env.OCFG_TUI_CONFIG ?? defaultTuiConfigPath()
  let text = "{}\n"

  try {
    text = await readFile(configPath, "utf8")
  } catch (caught) {
    if (!(caught && typeof caught === "object" && "code" in caught && caught.code === "ENOENT")) throw caught
  }
  if (!text.trim()) text = "{}\n"

  const parseErrors: ParseError[] = []
  parse(text, parseErrors, { allowTrailingComma: true })
  if (parseErrors.length > 0) throw new Error(`Failed to parse TUI config at ${configPath}.`)

  const edits = modify(text, ["language"], language, {
    formattingOptions: {
      insertSpaces: true,
      tabSize: 2,
    },
  })
  const nextText = applyEdits(text, edits)
  await mkdir(path.dirname(configPath), { recursive: true })
  await writeFile(configPath, nextText.endsWith("\n") ? nextText : `${nextText}\n`, "utf8")
  return configPath
}
