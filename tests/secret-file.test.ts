import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, test } from "vitest"
import { defaultSecretFilePath, expandHomePath, restoreSecretFile, snapshotSecretFile, writeSecretFileSafely } from "../src/core/secret-file.js"

async function tempDir() {
  return mkdtemp(path.join(os.tmpdir(), "oc-provider-secret-"))
}

function mode(value: number) {
  return value & 0o777
}

describe("secret file", () => {
  test("generates stable safe paths from provider IDs", () => {
    expect(defaultSecretFilePath("My OpenAI.Provider", "/home/test")).toBe(
      "/home/test/.config/ocfg/secrets/my-openai.provider.api-key",
    )
  })

  test("expands tilde paths", () => {
    expect(expandHomePath("~/.secrets/key", "/home/test")).toBe("/home/test/.secrets/key")
  })

  test("writes secret files with private permissions", async () => {
    const dir = await tempDir()
    const filePath = path.join(dir, "secrets", "provider.api-key")

    const result = await writeSecretFileSafely({ path: filePath, value: "sk-test" })

    expect(result.path).toBe(filePath)
    expect(await readFile(filePath, "utf8")).toBe("sk-test")
    expect(mode((await stat(path.dirname(filePath))).mode)).toBe(0o700)
    expect(mode((await stat(filePath)).mode)).toBe(0o600)
  })

  test("overwrites existing secret files", async () => {
    const dir = await tempDir()
    const filePath = path.join(dir, "provider.api-key")
    await writeFile(filePath, "old", { mode: 0o600 })

    await writeSecretFileSafely({ path: filePath, value: "new" })

    expect(await readFile(filePath, "utf8")).toBe("new")
  })

  test("restores an existing secret snapshot", async () => {
    const dir = await tempDir()
    const filePath = path.join(dir, "provider.api-key")
    await writeFile(filePath, "old", { mode: 0o600 })
    const snapshot = await snapshotSecretFile(filePath)

    await writeSecretFileSafely({ path: filePath, value: "new" })
    await restoreSecretFile(snapshot)

    expect(await readFile(filePath, "utf8")).toBe("old")
    expect(mode((await stat(filePath)).mode)).toBe(0o600)
  })

  test("removes a newly-created secret when restoring a missing snapshot", async () => {
    const dir = await tempDir()
    const filePath = path.join(dir, "provider.api-key")
    const snapshot = await snapshotSecretFile(filePath)

    await writeSecretFileSafely({ path: filePath, value: "new" })
    await restoreSecretFile(snapshot)

    await expect(stat(filePath)).rejects.toThrow()
  })
})
