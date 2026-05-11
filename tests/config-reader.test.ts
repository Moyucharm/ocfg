import { writeFile } from "node:fs/promises"
import { mkdtemp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, test } from "vitest"
import { readConfig } from "../src/core/config-reader.js"
import type { ConfigTarget } from "../src/core/types.js"

async function tempTarget(text?: string): Promise<ConfigTarget> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "oc-provider-editor-"))
  const filePath = path.join(dir, "opencode.jsonc")
  if (text !== undefined) await writeFile(filePath, text)
  return { scope: "project", path: filePath, exists: text !== undefined, format: "jsonc" }
}

describe("config reader", () => {
  test("returns empty schema document for missing file", async () => {
    const doc = await readConfig(await tempTarget())
    expect(doc.data.$schema).toBe("https://opencode.ai/config.json")
    expect(doc.text).toBe("")
    expect(doc.diagnostics).toEqual([])
  })

  test("parses jsonc with comments", async () => {
    const doc = await readConfig(await tempTarget('{ // comment\n "model": "a/b",\n }'))
    expect(doc.data.model).toBe("a/b")
    expect(doc.diagnostics).toEqual([])
  })

  test("reports parse errors", async () => {
    const doc = await readConfig(await tempTarget('{ "model": '))
    expect(doc.diagnostics[0]?.severity).toBe("high")
    expect(doc.diagnostics[0]?.source).toBe("parse")
  })
})
