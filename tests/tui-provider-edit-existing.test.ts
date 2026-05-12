import { describe, expect, test } from "vitest"
import { buildExistingProviderEditPatch } from "../src/tui/provider-edit-existing.js"

describe("existing provider TUI edit helper", () => {
  test("builds provider field patches without touching options", () => {
    const patch = buildExistingProviderEditPatch(
      { name: "Old", npm: "old", options: { apiKey: "{env:OLD}", timeout: 10 }, models: { model: {} } },
      { name: "New", endpointKind: "openai-responses" },
      "custom",
    )

    expect(patch).toEqual({ name: "New", npm: "@ai-sdk/openai" })
  })

  test("updates options while preserving unrelated option fields", () => {
    const patch = buildExistingProviderEditPatch(
      { options: { apiKey: "{env:OLD}", timeout: 10, setCacheKey: false } },
      { baseURL: "https://example.com/v1", setCacheKey: true },
      "custom",
    )

    expect(patch.options).toEqual({ apiKey: "{env:OLD}", timeout: 10, setCacheKey: true, baseURL: "https://example.com/v1" })
  })

  test("renders the managed file secret reference", () => {
    expect(buildExistingProviderEditPatch({ options: {} }, { apiKeyValue: "sk-test" }, "My OpenAI.Provider").options?.apiKey).toBe(
      "{file:~/.config/opencode-provider-editor/secrets/my-openai.provider.api-key}",
    )
  })

  test("empty baseURL removes existing baseURL", () => {
    const patch = buildExistingProviderEditPatch({ options: { baseURL: "https://old", timeout: 10 } }, { baseURL: "" }, "custom")

    expect(patch.options).toEqual({ timeout: 10 })
  })
})
