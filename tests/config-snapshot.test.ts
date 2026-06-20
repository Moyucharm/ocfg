import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { mkdtemp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, test } from "vitest"
import { rollbackConfigFileBatch, snapshotConfigFiles } from "../src/core/config-snapshot.js"
import type { ConfigDocument, ConfigTarget } from "../src/core/types.js"

function target(filePath: string, exists: boolean): ConfigTarget {
  return { scope: "custom", path: filePath, exists, format: "jsonc", ocfgDataPath: path.join(path.dirname(filePath), ".ocfg") }
}

function document(filePath: string, exists: boolean): ConfigDocument {
  return { target: target(filePath, exists), data: {}, text: exists ? "{}\n" : "", diagnostics: [] }
}

describe("config snapshots", () => {
  test("rolls back changed and newly-created config files", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "ocfg-config-snapshot-"))
    const existingPath = path.join(dir, "opencode.jsonc")
    const createdPath = path.join(dir, "tui.jsonc")
    await mkdir(dir, { recursive: true })
    await writeFile(existingPath, "{\"plugin\":[\"before\"]}\n", "utf8")

    const snapshots = await snapshotConfigFiles([document(existingPath, true), document(createdPath, false)])
    await writeFile(existingPath, "{\"plugin\":[\"after\"]}\n", "utf8")
    await writeFile(createdPath, "{\"plugin\":[\"created\"]}\n", "utf8")

    await rollbackConfigFileBatch(snapshots, [])

    await expect(readFile(existingPath, "utf8")).resolves.toBe("{\"plugin\":[\"before\"]}\n")
    await expect(stat(createdPath)).rejects.toThrow()
  })
})
