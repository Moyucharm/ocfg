import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { mkdtemp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, test } from "vitest"
import { parse } from "jsonc-parser"
import { createConfigDiff, stringifyConfig } from "../src/core/diff.js"
import { writeConfigSafely, type ValidationResult } from "../src/core/config-writer.js"
import type { ConfigDocument } from "../src/core/types.js"

async function tempDir() {
  return mkdtemp(path.join(os.tmpdir(), "oc-provider-editor-"))
}

function valid(): ValidationResult {
  return { valid: true, diagnostics: [] }
}

function invalid(): ValidationResult {
  return {
    valid: false,
    diagnostics: [{ severity: "high", source: "schema", path: "/", message: "invalid" }],
  }
}

function document(filePath: string, text: string, exists = true): ConfigDocument {
  return {
    target: { scope: "project", path: filePath, exists, format: "jsonc" },
    text,
    data: text ? (parse(text) as Record<string, unknown>) : { $schema: "https://opencode.ai/config.json" },
    diagnostics: [],
  }
}

describe("diff", () => {
  test("returns no changes for equal text", () => {
    expect(createConfigDiff("a", "a")).toBe("No changes.")
  })

  test("shows added provider content", () => {
    const diff = createConfigDiff("{}\n", stringifyConfig({ provider: { custom: {} } }))
    expect(diff).toContain("custom")
  })
})

describe("config writer", () => {
  test("dry-run does not write files", async () => {
    const dir = await tempDir()
    const filePath = path.join(dir, "opencode.jsonc")
    const result = await writeConfigSafely({
      document: document(filePath, "", false),
      nextConfig: { model: "a/b" },
      validate: valid,
      dryRun: true,
    })

    expect(result.written).toBe(false)
    await expect(stat(filePath)).rejects.toThrow()
  })

  test("validation failure prevents writes", async () => {
    const dir = await tempDir()
    const filePath = path.join(dir, "opencode.jsonc")
    const result = await writeConfigSafely({
      document: document(filePath, "", false),
      nextConfig: { invalid: true },
      validate: invalid,
    })

    expect(result.written).toBe(false)
    expect(result.diagnostics[0]?.message).toBe("invalid")
    await expect(stat(filePath)).rejects.toThrow()
  })

  test("creates new config file when missing", async () => {
    const dir = await tempDir()
    const filePath = path.join(dir, "nested", "opencode.jsonc")
    const result = await writeConfigSafely({
      document: document(filePath, "", false),
      nextConfig: { model: "a/b" },
      validate: valid,
    })

    expect(result.written).toBe(true)
    expect(result.backupPath).toBeUndefined()
    expect(await readFile(filePath, "utf8")).toContain('"model": "a/b"')
  })

  test("backs up existing config before write", async () => {
    const dir = await tempDir()
    await mkdir(dir, { recursive: true })
    const filePath = path.join(dir, "opencode.jsonc")
    const original = '{\n  "model": "old/model"\n}\n'
    await writeFile(filePath, original)

    const result = await writeConfigSafely({
      document: document(filePath, original),
      nextConfig: { model: "new/model" },
      validate: valid,
      now: new Date("2026-05-11T00:00:00.000Z"),
    })

    expect(result.written).toBe(true)
    expect(result.backupPath).toBe(`${filePath}.bak.20260511T000000Z`)
    expect(await readFile(result.backupPath!, "utf8")).toBe(original)
    expect(await readFile(filePath, "utf8")).toContain('"model": "new/model"')
  })

  test("uses provided nextText so JSONC comments can be preserved", async () => {
    const dir = await tempDir()
    const filePath = path.join(dir, "opencode.jsonc")
    const original = '{\n  // keep\n  "provider": {}\n}\n'
    const nextText = '{\n  // keep\n  "provider": {\n    "new": {}\n  }\n}\n'
    await writeFile(filePath, original)

    await writeConfigSafely({
      document: document(filePath, original),
      nextConfig: { provider: { new: {} } },
      nextText,
      validate: valid,
    })

    expect(await readFile(filePath, "utf8")).toBe(nextText)
  })
})
