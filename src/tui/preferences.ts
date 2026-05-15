import { readFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { parse, type ParseError } from "jsonc-parser"
import { isTuiThemeName, type TuiThemeName } from "./theme.js"
import { defaultTuiKeybinds, resolveTuiKeybinds, type TuiKeybindMap } from "./keybinds.js"

export type TuiDiffStyle = "unified" | "compact"

export type TuiPreferences = {
  theme: TuiThemeName
  keybinds: TuiKeybindMap
  diffStyle: TuiDiffStyle
  mouse: boolean
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
  mouse: true,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
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

function resolveMouse(value: unknown, diagnostics: string[]) {
  if (value === undefined) return defaultTuiPreferences.mouse
  if (typeof value === "boolean") return value
  diagnostics.push(`Unknown TUI mouse value "${String(value)}"; using "${String(defaultTuiPreferences.mouse)}".`)
  return defaultTuiPreferences.mouse
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

  return {
    preferences: {
      theme: resolveThemeName(value.theme, diagnostics),
      keybinds: resolveTuiKeybinds(value.keybinds),
      diffStyle: resolveDiffStyle(value.diffStyle, diagnostics),
      mouse: resolveMouse(value.mouse, diagnostics),
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
