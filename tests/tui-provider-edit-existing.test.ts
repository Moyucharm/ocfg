import { describe, expect, test } from "vitest"
import { buildExistingProviderEditPatch } from "../src/tui/provider-edit-existing.js"

describe("existing provider TUI edit helper", () => {
  test("builds provider field patches without touching options", () => {
    const patch = buildExistingProviderEditPatch(
      { name: "Old", npm: "old", options: { apiKey: "{env:OLD}", timeout: 10 }, models: { model: {} } },
      { name: "New", npm: "new" },
    )

    expect(patch).toEqual({ name: "New", npm: "new" })
  })

  test("updates options while preserving unrelated option fields", () => {
    const patch = buildExistingProviderEditPatch(
      { options: { apiKey: "{env:OLD}", timeout: 10, setCacheKey: false } },
      { baseURL: "https://example.com/v1", setCacheKey: true },
    )

    expect(patch.options).toEqual({ apiKey: "{env:OLD}", timeout: 10, setCacheKey: true, baseURL: "https://example.com/v1" })
  })

  test("renders safe secret references", () => {
    expect(buildExistingProviderEditPatch({ options: {} }, { apiKey: { type: "env", name: "API_KEY" } }).options?.apiKey).toBe(
      "{env:API_KEY}",
    )
    expect(buildExistingProviderEditPatch({ options: {} }, { apiKey: { type: "file", path: "~/.secret/key" } }).options?.apiKey).toBe(
      "{file:~/.secret/key}",
    )
  })

  test("requires explicit plaintext secret references", () => {
    expect(
      buildExistingProviderEditPatch({ options: {} }, { apiKey: { type: "plaintext", value: "sk-test", explicit: true } }).options?.apiKey,
    ).toBe("sk-test")
  })

  test("empty baseURL removes existing baseURL", () => {
    const patch = buildExistingProviderEditPatch({ options: { baseURL: "https://old", timeout: 10 } }, { baseURL: "" })

    expect(patch.options).toEqual({ timeout: 10 })
  })
})
