import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import os from "node:os"
import type { ConfigLocatorOptions, ConfigTarget } from "./types.js"

export type ConfigFileName = "opencode" | "tui"

function expandHome(filePath: string, home: string) {
  if (filePath === "~") return home
  if (filePath.startsWith("~/")) return path.join(home, filePath.slice(2))
  return filePath
}

function formatFromPath(filePath: string): "json" | "jsonc" {
  return filePath.endsWith(".json") ? "json" : "jsonc"
}

function jsoncConfigPath(directory: string, name: ConfigFileName) {
  return path.join(directory, `${name}.jsonc`)
}

function jsonConfigPath(directory: string, name: ConfigFileName) {
  return path.join(directory, `${name}.json`)
}

export function hasConfigFileContent(filePath: string) {
  if (!existsSync(filePath)) return false
  try {
    return readFileSync(filePath, "utf8").trim().length > 0
  } catch {
    return true
  }
}

function selectConfigPath(directory: string, name: ConfigFileName) {
  const jsoncPath = jsoncConfigPath(directory, name)
  const jsonPath = jsonConfigPath(directory, name)
  if (name === "tui") return existsSync(jsoncPath) || !hasConfigFileContent(jsonPath) ? jsoncPath : jsonPath
  return existsSync(jsoncPath) || !existsSync(jsonPath) ? jsoncPath : jsonPath
}

export function getDefaultGlobalConfigPath(home = os.homedir(), name: ConfigFileName = "opencode") {
  return jsoncConfigPath(path.join(home, ".config", "opencode"), name)
}

export function getDefaultOcfgDataPath(home = os.homedir()) {
  return path.join(home, ".config", "ocfg")
}

export function locateGlobalConfig(home = os.homedir(), name: ConfigFileName = "opencode"): ConfigTarget {
  const selected = selectConfigPath(path.join(home, ".config", "opencode"), name)

  return {
    scope: "global",
    path: selected,
    exists: existsSync(selected),
    format: formatFromPath(selected),
    ocfgDataPath: getDefaultOcfgDataPath(home),
  }
}

export function locateProjectConfig(cwd = process.cwd(), home = os.homedir(), name: ConfigFileName = "opencode"): ConfigTarget {
  let current = path.resolve(cwd)

  while (true) {
    const jsoncPath = jsoncConfigPath(current, name)
    const jsonPath = jsonConfigPath(current, name)

    if (existsSync(jsoncPath)) {
      return { scope: "project", path: jsoncPath, exists: true, format: "jsonc", ocfgDataPath: getDefaultOcfgDataPath(home) }
    }
    if (name === "tui" ? hasConfigFileContent(jsonPath) : existsSync(jsonPath)) {
      return { scope: "project", path: jsonPath, exists: true, format: "json", ocfgDataPath: getDefaultOcfgDataPath(home) }
    }

    const parent = path.dirname(current)
    if (parent === current) break
    if (existsSync(path.join(current, ".git"))) break
    current = parent
  }

  const createPath = jsoncConfigPath(path.resolve(cwd), name)
  return { scope: "project", path: createPath, exists: false, format: "jsonc", ocfgDataPath: getDefaultOcfgDataPath(home) }
}

function locateCustomConfig(configPath: string, home: string): ConfigTarget {
  const resolved = path.resolve(expandHome(configPath, home))

  return {
    scope: "custom",
    path: resolved,
    exists: existsSync(resolved),
    format: formatFromPath(resolved),
    ocfgDataPath: getDefaultOcfgDataPath(home),
  }
}

export function locateConfig(options: ConfigLocatorOptions = {}, name: ConfigFileName = "opencode"): ConfigTarget {
  const home = options.home ?? os.homedir()
  if (options.configPath) {
    return locateCustomConfig(options.configPath, home)
  }

  if (options.scope === "project") return locateProjectConfig(options.cwd, home, name)
  return locateGlobalConfig(home, name)
}
