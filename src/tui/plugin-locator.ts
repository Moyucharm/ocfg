import type { ConfigLocatorOptions } from "../core/types.js"
import type { TuiConfigSelection } from "./types.js"

export function pluginLocatorOptions(selection: TuiConfigSelection): ConfigLocatorOptions {
  if (selection.scope === "project") return { scope: "project" }
  return { scope: selection.scope, configPath: selection.target?.path }
}
