import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, test } from "vitest"
import { updateManagedEnvBlock, writeUserEnvVar, type CommandRunner } from "../src/core/user-env.js"

async function tempDir() {
  return mkdtemp(path.join(os.tmpdir(), "ocfg-user-env-"))
}

describe("user environment writer", () => {
  test("writes a managed POSIX block without sourcing bashrc", async () => {
    const home = await tempDir()
    const calls: Array<{ command: string; args: string[] }> = []
    const commandRunner: CommandRunner = async (command, args) => {
      calls.push({ command, args })
    }
    const env: NodeJS.ProcessEnv = { SHELL: "/bin/bash" }

    const result = await writeUserEnvVar("OPENCODE_ENABLE_EXA", "1", { home, platform: "linux", env, commandRunner })

    expect(env.OPENCODE_ENABLE_EXA).toBeUndefined()
    expect(result.targetPath).toBe(path.join(home, ".bashrc"))
    expect(calls).toEqual([])
    expect(await readFile(path.join(home, ".bashrc"), "utf8")).toContain("export OPENCODE_ENABLE_EXA=1")
  })

  test("updates an existing managed block without duplication", () => {
    const once = updateManagedEnvBlock("export PATH=/usr/bin\n", "OPENCODE_ENABLE_EXA", "1")
    const twice = updateManagedEnvBlock(once, "OPENCODE_ENABLE_EXA", "0")

    expect(twice.match(/>>> ocfg opencode exa/g)).toHaveLength(1)
    expect(twice).toContain("export OPENCODE_ENABLE_EXA=0")
    expect(twice).not.toContain("export OPENCODE_ENABLE_EXA=1")
  })

  test("uses zshrc for zsh shells", async () => {
    const home = await tempDir()
    const env: NodeJS.ProcessEnv = { SHELL: "/bin/zsh" }

    const result = await writeUserEnvVar("OPENCODE_ENABLE_EXA", "1", { home, platform: "darwin", env, commandRunner: async () => undefined })

    expect(result.targetPath).toBe(path.join(home, ".zshrc"))
    expect(await readFile(path.join(home, ".zshrc"), "utf8")).toContain("export OPENCODE_ENABLE_EXA=1")
  })

  test("reuses an existing managed block before choosing the current shell file", async () => {
    const home = await tempDir()
    const profile = path.join(home, ".profile")
    await writeFile(profile, updateManagedEnvBlock("", "OPENCODE_ENABLE_EXA", "0"), "utf8")

    const result = await writeUserEnvVar("OPENCODE_ENABLE_EXA", "1", { home, platform: "linux", shell: "/bin/bash" })

    expect(result.targetPath).toBe(profile)
    expect(await readFile(profile, "utf8")).toContain("export OPENCODE_ENABLE_EXA=1")
    await expect(readFile(path.join(home, ".bashrc"), "utf8")).rejects.toThrow()
  })

  test("prefers the current shell file when multiple managed blocks exist", async () => {
    const home = await tempDir()
    const bashrc = path.join(home, ".bashrc")
    const profile = path.join(home, ".profile")
    await writeFile(bashrc, updateManagedEnvBlock("", "OPENCODE_ENABLE_EXA", "0"), "utf8")
    await writeFile(profile, updateManagedEnvBlock("", "OPENCODE_ENABLE_EXA", "0"), "utf8")

    const result = await writeUserEnvVar("OPENCODE_ENABLE_EXA", "1", { home, platform: "linux", shell: "/bin/bash" })

    expect(result.targetPath).toBe(bashrc)
    expect(await readFile(bashrc, "utf8")).toContain("export OPENCODE_ENABLE_EXA=1")
    expect(await readFile(profile, "utf8")).toContain("export OPENCODE_ENABLE_EXA=0")
  })

  test("preserves existing shell config content", async () => {
    const home = await tempDir()
    const bashrc = path.join(home, ".bashrc")
    await writeFile(bashrc, "# keep\nexport EDITOR=vim\n", "utf8")

    await writeUserEnvVar("OPENCODE_ENABLE_EXA", "1", { home, platform: "linux", shell: "/bin/bash" })

    const text = await readFile(bashrc, "utf8")
    expect(text).toContain("# keep")
    expect(text).toContain("export EDITOR=vim")
    expect(text).toContain("export OPENCODE_ENABLE_EXA=1")
  })

  test("uses setx for Windows user environment", async () => {
    const calls: Array<{ command: string; args: string[] }> = []
    const env: NodeJS.ProcessEnv = {}

    const result = await writeUserEnvVar("OPENCODE_ENABLE_EXA", "0", {
      platform: "win32",
      env,
      commandRunner: async (command, args) => {
        calls.push({ command, args })
      },
    })

    expect(env.OPENCODE_ENABLE_EXA).toBeUndefined()
    expect(result.command).toBe("setx OPENCODE_ENABLE_EXA 0")
    expect(calls).toEqual([{ command: "setx", args: ["OPENCODE_ENABLE_EXA", "0"] }])
  })
})
