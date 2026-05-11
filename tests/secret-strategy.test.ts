import { describe, expect, test } from "vitest"
import {
  PlaintextSecretError,
  assertPlaintextAllowed,
  detectPlaintextApiKey,
  looksLikeSecret,
  renderSecretRef,
} from "../src/core/secret-strategy.js"
import type { SecretRef } from "../src/core/types.js"

describe("secret strategy", () => {
  test("renders env references", () => {
    expect(renderSecretRef({ type: "env", name: "OPENAI_API_KEY" })).toBe("{env:OPENAI_API_KEY}")
  })

  test("renders file references", () => {
    expect(renderSecretRef({ type: "file", path: "~/.secrets/openai" })).toBe("{file:~/.secrets/openai}")
  })

  test("renders explicitly confirmed plaintext", () => {
    expect(renderSecretRef({ type: "plaintext", value: "sk-test", explicit: true })).toBe("sk-test")
  })

  test("rejects unconfirmed plaintext at runtime", () => {
    const ref = { type: "plaintext", value: "sk-test", explicit: false } as unknown as SecretRef
    expect(() => renderSecretRef(ref)).toThrow(PlaintextSecretError)
    expect(() => assertPlaintextAllowed(ref)).toThrow(PlaintextSecretError)
  })

  test("detects common plaintext key patterns", () => {
    expect(looksLikeSecret("sk-1234567890")).toBe(true)
    expect(looksLikeSecret("AIzaSyA1234567890")).toBe(true)
    expect(looksLikeSecret("abcdefghijklmnopqrstuvwxyz123456")).toBe(true)
  })

  test("does not flag env or file references", () => {
    expect(looksLikeSecret("{env:OPENAI_API_KEY}")).toBe(false)
    expect(looksLikeSecret("{file:~/.secrets/openai}")).toBe(false)
  })

  test("returns diagnostics for plaintext keys", () => {
    const diagnostics = detectPlaintextApiKey("sk-1234567890", "/provider/openai/options/apiKey")
    expect(diagnostics[0]?.severity).toBe("medium")
    expect(diagnostics[0]?.source).toBe("config")
    expect(diagnostics[0]?.path).toBe("/provider/openai/options/apiKey")
  })

  test("returns no diagnostics for safe references", () => {
    expect(detectPlaintextApiKey("{env:OPENAI_API_KEY}")).toEqual([])
    expect(detectPlaintextApiKey("{file:~/.secrets/openai}")).toEqual([])
  })
})
