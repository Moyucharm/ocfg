import { describe, expect, test } from "vitest"
import { pluginLocatorOptions } from "../src/tui/plugin-locator.js"
import type { ConfigTarget } from "../src/core/types.js"

function target(path: string, scope: ConfigTarget["scope"]): ConfigTarget {
  return { path, scope, exists: true, format: "jsonc", ocfgDataPath: "/tmp/ocfg" }
}

describe("TUI plugin locator", () => {
  test("does not pass the selected project config path to plugin host lookup", () => {
    expect(pluginLocatorOptions({ scope: "project", target: target("/repo/opencode.jsonc", "project") })).toEqual({ scope: "project" })
  })

  test("keeps explicit non-project config paths", () => {
    expect(pluginLocatorOptions({ scope: "global", target: target("/home/alice/.config/opencode/opencode.jsonc", "global") })).toEqual({
      scope: "global",
      configPath: "/home/alice/.config/opencode/opencode.jsonc",
    })
  })
})
