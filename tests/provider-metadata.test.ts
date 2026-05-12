import { mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, test } from "vitest"
import { inferEndpointKindFromProvider, providerApiKeyRef, providerBaseURL, resolveProviderApiKey } from "../src/tui/provider-metadata.js"

describe("provider metadata helpers", () => {
  test("infers endpoint kind from provider npm", () => {
    expect(inferEndpointKindFromProvider({ npm: "@ai-sdk/openai-compatible" })).toBe("openai-compatible")
    expect(inferEndpointKindFromProvider({ npm: "@ai-sdk/openai" })).toBe("openai-responses")
  })

  test("reads base url and parses env secret refs", () => {
    const provider = { options: { baseURL: "https://example.com/v1", apiKey: "{env:CUSTOM_API_KEY}" } }
    expect(providerBaseURL(provider)).toBe("https://example.com/v1")
    expect(providerApiKeyRef(provider)).toEqual({ type: "env", name: "CUSTOM_API_KEY" })
  })

  test("resolves env-backed api keys", async () => {
    process.env.CUSTOM_API_KEY = "sk-env-test"
    await expect(resolveProviderApiKey({ options: { apiKey: "{env:CUSTOM_API_KEY}" } })).resolves.toBe("sk-env-test")
  })

  test("resolves file-backed api keys", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "oc-provider-metadata-"))
    const filePath = path.join(dir, "provider.api-key")
    await writeFile(filePath, "sk-file-test\n")

    await expect(resolveProviderApiKey({ options: { apiKey: `{file:${filePath}}` } })).resolves.toBe("sk-file-test")
  })

  test("passes through plaintext api keys", async () => {
    await expect(resolveProviderApiKey({ options: { apiKey: "sk-plain-test" } })).resolves.toBe("sk-plain-test")
  })
})
