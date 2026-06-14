import { describe, expect, test } from "vitest"
import { addPlugin, deletePlugin, disablePlugin, enablePlugin, listPlugins, PluginEditorError, updatePluginOptions } from "../src/core/plugin-editor.js"

describe("plugin editor", () => {
  test("adds plugin packages without mutating input", () => {
    const input = {}
    const next = addPlugin(input, "opencode-wakatime")

    expect(input).toEqual({})
    expect(next.$schema).toBe("https://opencode.ai/config.json")
    expect(next.plugin).toEqual(["opencode-wakatime"])
  })

  test("adds plugin packages with options tuples", () => {
    const next = addPlugin({}, "@my-org/custom-plugin", { enabled: true })

    expect(next.plugin).toEqual([["@my-org/custom-plugin", { enabled: true }]])
    expect(listPlugins(next)).toEqual([
      {
        index: 0,
        packageName: "@my-org/custom-plugin",
        options: { enabled: true },
        kind: "package-with-options",
        status: "enabled",
      },
    ])
  })

  test("updates and clears plugin options", () => {
    const config = addPlugin({}, "opencode-wakatime")
    const withOptions = updatePluginOptions(config, "opencode-wakatime", { options: { apiKey: "{env:WAKATIME_API_KEY}" } })
    const cleared = updatePluginOptions(withOptions, "opencode-wakatime", { clearOptions: true })

    expect(withOptions.plugin).toEqual([["opencode-wakatime", { apiKey: "{env:WAKATIME_API_KEY}" }]])
    expect(cleared.plugin).toEqual(["opencode-wakatime"])
    expect(config.plugin).toEqual(["opencode-wakatime"])
  })

  test("enables plugins idempotently and disables without requiring an existing entry", () => {
    const config = enablePlugin({}, "opencode-wakatime")
    const enabledAgain = enablePlugin(config, "opencode-wakatime", { enabled: true })
    const disabled = disablePlugin(enabledAgain, "opencode-wakatime")
    const disabledAgain = disablePlugin(disabled, "opencode-wakatime")

    expect(config.plugin).toEqual(["opencode-wakatime"])
    expect(enabledAgain.plugin).toEqual([["opencode-wakatime", { enabled: true }]])
    expect(disabled.plugin).toEqual([])
    expect(disabledAgain.plugin).toEqual([])
  })

  test("deletes plugins", () => {
    const config = addPlugin(addPlugin({}, "one"), "two")
    const next = deletePlugin(config, "one")

    expect(next.plugin).toEqual(["two"])
    expect(config.plugin).toEqual(["one", "two"])
  })

  test("rejects duplicates and missing entries", () => {
    const config = addPlugin({}, "opencode-wakatime")

    expect(() => addPlugin(config, "opencode-wakatime")).toThrow(PluginEditorError)
    expect(() => deletePlugin(config, "missing")).toThrow(PluginEditorError)
    expect(() => updatePluginOptions(config, "missing", { clearOptions: true })).toThrow(PluginEditorError)
  })

  test("rejects invalid plugin config shapes", () => {
    expect(() => listPlugins({ plugin: "opencode-wakatime" })).toThrow(PluginEditorError)
    expect(() => listPlugins({ plugin: [["opencode-wakatime", "bad-options"]] })).toThrow(PluginEditorError)
    expect(() => addPlugin({}, "bad package")).toThrow(PluginEditorError)
    expect(() => updatePluginOptions({ plugin: ["one"] }, "one", {})).toThrow(PluginEditorError)
  })
})
