import { existsSync } from "node:fs"
import path from "node:path"
import os from "node:os"
import type { ConfigLocatorOptions, ConfigTarget } from "./types.js"

function expandHome(filePath: string, home: string) {
  if (filePath === "~") return home
  if (filePath.startsWith("~/")) return path.join(home, filePath.slice(2))
  return filePath
}

function formatFromPath(filePath: string): "json" | "jsonc" {
  return filePath.endsWith(".json") ? "json" : "jsonc"
}

export function getDefaultGlobalConfigPath(home = os.homedir()) {
  return path.join(home, ".config", "opencode", "opencode.jsonc")
}

export function locateGlobalConfig(home = os.homedir()): ConfigTarget {
  const jsoncPath = getDefaultGlobalConfigPath(home)
  const jsonPath = path.join(home, ".config", "opencode", "opencode.json")
  const selected = existsSync(jsoncPath) || !existsSync(jsonPath) ? jsoncPath : jsonPath

  return {
    scope: "global",
    path: selected,
    exists: existsSync(selected),
    format: formatFromPath(selected),
  }
}

export function locateProjectConfig(cwd = process.cwd()): ConfigTarget {
  let current = path.resolve(cwd)

  while (true) {
    const jsoncPath = path.join(current, "opencode.jsonc")
    const jsonPath = path.join(current, "opencode.json")

    if (existsSync(jsoncPath)) {
      return { scope: "project", path: jsoncPath, exists: true, format: "jsonc" }
    }
    if (existsSync(jsonPath)) {
      return { scope: "project", path: jsonPath, exists: true, format: "json" }
    }

    const parent = path.dirname(current)
    if (parent === current) break
    if (existsSync(path.join(current, ".git"))) break
    current = parent
  }

  const createPath = path.join(path.resolve(cwd), "opencode.jsonc")
  return { scope: "project", path: createPath, exists: false, format: "jsonc" }
}

export function locateConfig(options: ConfigLocatorOptions = {}): ConfigTarget {
  const home = options.home ?? os.homedir()
  if (options.configPath) {
    const resolved = path.resolve(expandHome(options.configPath, home))
    return {
      scope: "custom",
      path: resolved,
      exists: existsSync(resolved),
      format: formatFromPath(resolved),
    }
  }

  if (options.scope === "project") return locateProjectConfig(options.cwd)
  return locateGlobalConfig(home)
}
