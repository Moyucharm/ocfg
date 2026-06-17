import { createHash } from "node:crypto"
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises"
import { mkdtemp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, test } from "vitest"
import { parse } from "jsonc-parser"
import { createConfigDiff, stringifyConfig } from "../src/core/diff.js"
import { resolveConfigBackupDirectory, writeConfigSafely, type ValidationResult } from "../src/core/config-writer.js"
import { applyProviderEdit } from "../src/core/jsonc-editor.js"
import { addProvider } from "../src/core/provider-editor.js"
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

function ocfgDataPathFor(filePath: string) {
  return path.join(path.dirname(filePath), ".ocfg")
}

function backupPrefixFor(filePath: string) {
  const hash = createHash("sha256").update(path.resolve(filePath)).digest("hex").slice(0, 12)
  return `${path.basename(filePath)}.${hash}.bak.`
}

function backupPathFor(filePath: string, timestamp: string, ocfgDataPath?: string) {
  return path.join(resolveConfigBackupDirectory(document(filePath, "{}\n", true, ocfgDataPath).target), `${backupPrefixFor(filePath)}${timestamp}`)
}

function document(filePath: string, text: string, exists = true, ocfgDataPath = ocfgDataPathFor(filePath)): ConfigDocument {
  return {
    target: { scope: "project", path: filePath, exists, format: "jsonc", ocfgDataPath },
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
    expect(diff).toContain("+")
  })

  test("shows removed content", () => {
    const diff = createConfigDiff('{\n  "model": "old/model"\n}\n', "{}\n")
    expect(diff).toContain('-   "model": "old/model"')
  })
})

describe("config writer", () => {
  test("dry-run does not write files", async () => {
    const dir = await tempDir()
    const targetDir = path.join(dir, "nested")
    const filePath = path.join(targetDir, "opencode.jsonc")
    let validated = false
    const result = await writeConfigSafely({
      document: document(filePath, "", false),
      nextConfig: { model: "a/b" },
      validate: () => {
        validated = true
        return valid()
      },
      dryRun: true,
    })

    expect(validated).toBe(true)
    expect(result.written).toBe(false)
    await expect(stat(targetDir)).rejects.toThrow()
    await expect(stat(filePath)).rejects.toThrow()
  })

  test("validation failure prevents writes", async () => {
    const dir = await tempDir()
    const targetDir = path.join(dir, "nested")
    const filePath = path.join(targetDir, "opencode.jsonc")
    const result = await writeConfigSafely({
      document: document(filePath, "", false),
      nextConfig: { invalid: true },
      validate: invalid,
    })

    expect(result.written).toBe(false)
    expect(result.diagnostics[0]?.message).toBe("invalid")
    await expect(stat(targetDir)).rejects.toThrow()
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
    expect(result.backupPath).toBe(backupPathFor(filePath, "20260511T000000Z"))
    expect(await readFile(result.backupPath!, "utf8")).toBe(original)
    expect(await readFile(filePath, "utf8")).toContain('"model": "new/model"')
    expect((await readdir(dir)).filter((entry) => entry.includes(".bak."))).toEqual([])
  })

  test("does not create backup when backup is disabled", async () => {
    const dir = await tempDir()
    const filePath = path.join(dir, "opencode.jsonc")
    await writeFile(filePath, '{}\n')

    const result = await writeConfigSafely({
      document: document(filePath, '{}\n'),
      nextConfig: { model: "a/b" },
      validate: valid,
      backup: false,
      now: new Date("2026-05-11T00:00:00.000Z"),
    })

    expect(result.backupPath).toBeUndefined()
    expect((await readdir(dir)).filter((entry) => entry.includes(".bak."))).toEqual([])
  })

  test("does not overwrite existing backups with the same timestamp", async () => {
    const dir = await tempDir()
    const filePath = path.join(dir, "opencode.jsonc")
    const original = '{\n  "model": "old/model"\n}\n'
    const existingBackup = backupPathFor(filePath, "20260511T000000Z")
    await writeFile(filePath, original)
    await mkdir(path.dirname(existingBackup), { recursive: true })
    await writeFile(existingBackup, "do not overwrite")

    const result = await writeConfigSafely({
      document: document(filePath, original),
      nextConfig: { model: "new/model" },
      validate: valid,
      now: new Date("2026-05-11T00:00:00.000Z"),
    })

    expect(result.backupPath).toBe(`${existingBackup}.1`)
    expect(await readFile(existingBackup, "utf8")).toBe("do not overwrite")
    expect(await readFile(result.backupPath!, "utf8")).toBe(original)
  })

  test("keeps only the latest ten config backups", async () => {
    const dir = await tempDir()
    const filePath = path.join(dir, "opencode.jsonc")
    const original = '{\n  "model": "old/model"\n}\n'
    const backupDirectory = resolveConfigBackupDirectory(document(filePath, original).target)
    await writeFile(filePath, original)
    await mkdir(backupDirectory, { recursive: true })

    const backupPrefix = backupPrefixFor(filePath)
    for (let day = 1; day <= 10; day += 1) {
      const timestamp = `202605${String(day).padStart(2, "0")}T000000Z`
      await writeFile(path.join(backupDirectory, `${backupPrefix}${timestamp}`), `backup-${day}`)
    }
    await writeFile(path.join(backupDirectory, "other.jsonc.bak.20260501T000000Z"), "keep")

    const result = await writeConfigSafely({
      document: document(filePath, original),
      nextConfig: { model: "new/model" },
      validate: valid,
      now: new Date("2026-05-11T00:00:00.000Z"),
    })

    const entries = await readdir(backupDirectory)
    const backups = entries.filter((entry) => entry.startsWith(backupPrefix)).sort()
    expect(result.backupPath).toBe(backupPathFor(filePath, "20260511T000000Z"))
    expect(backups).toHaveLength(10)
    expect(backups).not.toContain(`${backupPrefix}20260501T000000Z`)
    expect(backups).toContain(`${backupPrefix}20260511T000000Z`)
    expect(entries).toContain("other.jsonc.bak.20260501T000000Z")
  })

  test("keeps centralized backups for same basenames separate", async () => {
    const dir = await tempDir()
    const sharedOcfgDataPath = path.join(dir, ".ocfg")
    const firstPath = path.join(dir, "first", "opencode.jsonc")
    const secondPath = path.join(dir, "second", "opencode.jsonc")
    const original = '{\n  "model": "old/model"\n}\n'
    const firstDocument = document(firstPath, original, true, sharedOcfgDataPath)
    const secondDocument = document(secondPath, original, true, sharedOcfgDataPath)
    const backupDirectory = resolveConfigBackupDirectory(firstDocument.target)
    const firstPrefix = backupPrefixFor(firstPath)
    const secondPrefix = backupPrefixFor(secondPath)
    await mkdir(path.dirname(firstPath), { recursive: true })
    await mkdir(path.dirname(secondPath), { recursive: true })
    await mkdir(backupDirectory, { recursive: true })
    await writeFile(firstPath, original)
    await writeFile(secondPath, original)

    for (let day = 1; day <= 10; day += 1) {
      const timestamp = `202605${String(day).padStart(2, "0")}T000000Z`
      await writeFile(path.join(backupDirectory, `${firstPrefix}${timestamp}`), `first-${day}`)
    }
    await writeFile(path.join(backupDirectory, `${secondPrefix}20260501T000000Z`), "second")

    await writeConfigSafely({
      document: firstDocument,
      nextConfig: { model: "new/model" },
      validate: valid,
      now: new Date("2026-05-11T00:00:00.000Z"),
    })

    const entries = await readdir(backupDirectory)
    expect(entries.filter((entry) => entry.startsWith(firstPrefix))).toHaveLength(10)
    expect(entries).toContain(`${secondPrefix}20260501T000000Z`)
    expect(await readFile(secondDocument.target.path, "utf8")).toBe(original)
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

  test("combines object edits, jsonc edits, dry-run, backup, and validation", async () => {
    const dir = await tempDir()
    const filePath = path.join(dir, "opencode.jsonc")
    const original = `{
  // keep
  "$schema": "https://opencode.ai/config.json",
  "provider": {}
}
`
    await writeFile(filePath, original)
    const baseDocument = document(filePath, original)
    const nextConfig = addProvider(baseDocument.data, {
      id: "custom",
      name: "Custom",
      npm: "@ai-sdk/openai-compatible",
      options: { apiKey: "{env:CUSTOM_API_KEY}" },
      models: { model: { limit: { context: 1, output: 1 } } },
    })
    const nextText = applyProviderEdit(baseDocument, "custom", (nextConfig.provider as any).custom)

    const dryRun = await writeConfigSafely({ document: baseDocument, nextConfig, nextText, validate: valid, dryRun: true })
    expect(dryRun.written).toBe(false)
    expect(await readFile(filePath, "utf8")).toBe(original)

    const written = await writeConfigSafely({
      document: baseDocument,
      nextConfig,
      nextText,
      validate: valid,
      now: new Date("2026-05-11T00:00:00.000Z"),
    })

    const finalText = await readFile(filePath, "utf8")
    expect(written.backupPath).toBe(backupPathFor(filePath, "20260511T000000Z"))
    expect(finalText).toContain("// keep")
    expect(parse(finalText).provider.custom.models.model.limit.context).toBe(1)
  })
})
