import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { mkdtemp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, test } from "vitest"
import {
  activeAgentsForPrompt,
  addInstructionRef,
  assessRuleOverwriteRisk,
  clearAgentPrompt,
  defaultPromptTemplates,
  deletePromptFileSafely,
  deleteRuleProfileSafely,
  deleteRuleFileSafely,
  instructionRefForFile,
  installPromptTemplate,
  listConfigInstructionItems,
  listPromptFiles,
  listRuleProfiles,
  listRuleFiles,
  normalizePromptFileName,
  instructionRefForPromptFile,
  promptFilePath,
  promptRefForFile,
  readRuleFile,
  readRuleProfile,
  removeInstructionRef,
  removePromptReferences,
  resolvePromptDirectory,
  resolveRuleBackupDirectory,
  resolveRuleProfileDirectory,
  setAgentPrompt,
  writeRuleProfileSafely,
  writeRuleFileSafely,
  writePromptFileSafely,
} from "../src/core/prompt-manager.js"
import type { ConfigTarget } from "../src/core/types.js"

async function target(): Promise<ConfigTarget> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ocfg-prompts-"))
  return {
    scope: "project",
    path: path.join(dir, "opencode.jsonc"),
    exists: false,
    format: "jsonc",
    ocfgDataPath: path.join(dir, ".ocfg"),
  }
}

describe("prompt manager", () => {
  test("normalizes prompt filenames", () => {
    expect(normalizePromptFileName("Strict Review")).toBe("Strict-Review.md")
    expect(normalizePromptFileName("代码审查")).toBe("代码审查.md")
    expect(normalizePromptFileName("../small.txt")).toBe("small.txt")
    expect(() => normalizePromptFileName("bad.json")).toThrow()
  })

  test("writes lists and deletes prompt files", async () => {
    const configTarget = await target()
    const result = await writePromptFileSafely(configTarget, "review-strict.md", "# Review\n\nLook for bugs.\n", { now: new Date("2026-05-11T00:00:00.000Z") })

    expect(result.path).toBe(promptFilePath(configTarget, "review-strict.md"))
    const files = await listPromptFiles(configTarget, {
      agent: { review: { prompt: promptRefForFile("review-strict.md", configTarget) } },
    })
    expect(files).toMatchObject([
      {
        id: "review-strict",
        title: "Review",
        description: "Look for bugs.",
        activeAgents: ["review"],
        instructionRefs: [],
      },
    ])

    const edited = await writePromptFileSafely(configTarget, "review-strict.md", "updated\n", { now: new Date("2026-05-11T00:00:00.000Z") })
    expect(edited.backupPath).toBe(`${result.path}.bak.20260511T000000Z`)
    expect(await readFile(edited.backupPath!, "utf8")).toContain("# Review")

    await deletePromptFileSafely(configTarget, "review-strict")
    await expect(stat(result.path)).rejects.toThrow()
  })

  test("installs default prompt templates into the prompt directory", async () => {
    const configTarget = await target()

    await installPromptTemplate(configTarget, defaultPromptTemplates[0]!.id)

    const installedPath = path.join(resolvePromptDirectory(configTarget), defaultPromptTemplates[0]!.fileName)
    await expect(readFile(installedPath, "utf8")).resolves.toContain("OpenCode")
  })

  test("applies and clears agent prompt refs without mutating input", () => {
    const input = {
      agent: {
        build: { mode: "primary", temperature: 0.2 },
      },
    }
    const ref = promptRefForFile("build-focused.md")
    const next = setAgentPrompt(input, "build", ref)

    expect(input.agent.build).not.toHaveProperty("prompt")
    expect((next.agent as any).build).toEqual({ mode: "primary", temperature: 0.2, prompt: ref })
    expect(activeAgentsForPrompt(next, ref)).toEqual(["build"])
    expect((clearAgentPrompt(next, "build").agent as any).build.prompt).toBeUndefined()
  })

  test("creates custom agent metadata without adding it to built-in agents", () => {
    const ref = promptRefForFile("custom.md")
    const builtIn = setAgentPrompt({}, "build", ref, { description: "Custom", mode: "primary" })
    const custom = setAgentPrompt({}, "reviewer", ref, { description: "Custom", mode: "primary" })

    expect((builtIn.agent as any).build).toEqual({ prompt: ref })
    expect((custom.agent as any).reviewer).toEqual({ prompt: ref, description: "Custom", mode: "primary" })
  })

  test("removes prompt references from agents and instructions", () => {
    const ref = promptRefForFile("review-strict.md")
    const instructionRef = instructionRefForPromptFile("review-strict.md")
    const next = removePromptReferences({
      instructions: [instructionRef, "docs/rules.md"],
      agent: {
        build: { prompt: ref },
        plan: { prompt: "{file:./prompts/plan.md}" },
      },
    }, ref, instructionRef)

    expect((next.agent as any).build.prompt).toBeUndefined()
    expect((next.agent as any).plan.prompt).toBe("{file:./prompts/plan.md}")
    expect(next.instructions).toEqual(["docs/rules.md"])
  })

  test("manages AGENTS.md rule files for the selected config target", async () => {
    const configTarget = await target()

    expect((await listRuleFiles(configTarget))[0]).toMatchObject({
      title: "Project AGENTS.md",
      exists: false,
      path: path.join(path.dirname(configTarget.path), "AGENTS.md"),
    })

    const written = await writeRuleFileSafely(configTarget, "---\nname: test-rules\ndescription: Team rules.\n---\n# Rules\n\nUse tests.\n", { now: new Date("2026-05-11T00:00:00.000Z") })
    expect(await readRuleFile(configTarget)).toContain("Use tests")
    expect((await listRuleFiles(configTarget))[0]).toMatchObject({ exists: true, description: "Team rules." })

    const edited = await writeRuleFileSafely(configTarget, "updated\n", { now: new Date("2026-05-11T00:00:00.000Z") })
    expect(edited.backupPath).toBe(path.join(resolveRuleBackupDirectory(configTarget), "AGENTS.md.bak.20260511T000000Z"))
    expect(edited.preservedPath).toBe(path.join(resolveRuleProfileDirectory(configTarget), "previous-agents-20260511T000000Z.md"))
    await expect(readFile(edited.preservedPath!, "utf8")).resolves.toContain("Use tests")

    const deleted = await deleteRuleFileSafely(configTarget, { now: new Date("2026-05-11T00:00:01.000Z") })
    expect(deleted.backupPath).toBe(path.join(resolveRuleBackupDirectory(configTarget), "AGENTS.md.bak.20260511T000001Z"))
    expect(deleted.preservedPath).toBe(path.join(resolveRuleProfileDirectory(configTarget), "previous-agents-20260511T000001Z.md"))
    await expect(readFile(deleted.backupPath!, "utf8")).resolves.toBe("updated\n")
    await expect(readFile(deleted.preservedPath!, "utf8")).resolves.toBe("updated\n")
    await expect(stat(written.path)).rejects.toThrow()
  })

  test("manages switchable AGENTS.md config profiles", async () => {
    const configTarget = await target()

    await writeRuleProfileSafely(configTarget, "fufu", "---\nname: 浮浮酱\ndescription: 猫娘工程师。\n---\n# 浮浮酱\n")
    await writeRuleFileSafely(configTarget, "---\nname: 浮浮酱\ndescription: 猫娘工程师。\n---\n# 浮浮酱\n")

    const profiles = await listRuleProfiles(configTarget)
    expect(profiles).toMatchObject([{
      id: "fufu",
      title: "浮浮酱",
      description: "猫娘工程师。",
      path: path.join(resolveRuleProfileDirectory(configTarget), "fufu.md"),
      active: true,
    }])
    await expect(readRuleProfile(configTarget, "fufu")).resolves.toContain("# 浮浮酱")

    await deleteRuleProfileSafely(configTarget, "fufu")
    expect(await listRuleProfiles(configTarget)).toEqual([])
  })

  test("assesses AGENTS.md overwrite risk only when current rules are unsaved", async () => {
    const configTarget = await target()

    expect(await assessRuleOverwriteRisk(configTarget, "# Next\n")).toMatchObject({ risky: false })

    await writeRuleFileSafely(configTarget, "# Unsaved\n", { backup: false })
    expect(await assessRuleOverwriteRisk(configTarget, "# Next\n")).toMatchObject({
      risky: true,
      rulesPath: path.join(path.dirname(configTarget.path), "AGENTS.md"),
      profileDirectory: resolveRuleProfileDirectory(configTarget),
      backupDirectory: resolveRuleBackupDirectory(configTarget),
    })
    expect(await assessRuleOverwriteRisk(configTarget, "# Unsaved\n")).toMatchObject({ risky: false })

    await writeRuleProfileSafely(configTarget, "saved", "# Unsaved\n")
    expect(await assessRuleOverwriteRisk(configTarget, "# Next\n")).toMatchObject({ risky: false })
  })

  test("lists and updates config instruction refs", async () => {
    const configTarget = await target()
    const rulesPath = path.join(path.dirname(configTarget.path), "rules.md")
    await writeFile(rulesPath, "# Rules\n\nAlways verify.\n")

    const withInstruction = addInstructionRef({}, instructionRefForFile(configTarget, rulesPath))
    const withRemote = addInstructionRef(withInstruction, "https://example.com/rules.md")
    const withGlob = addInstructionRef(withRemote, "docs/*.md")
    const items = await listConfigInstructionItems(configTarget, withGlob)

    expect(items.map((item) => [item.ref, item.kind, item.editable, item.exists])).toEqual([
      ["rules.md", "file", true, true],
      ["https://example.com/rules.md", "remote", false, undefined],
      ["docs/*.md", "glob", false, undefined],
    ])
    expect(items[0]?.description).toBe("Always verify.")
    expect(removeInstructionRef(withGlob, "rules.md").instructions).toEqual(["https://example.com/rules.md", "docs/*.md"])
  })

  test("ignores non-prompt files while listing", async () => {
    const configTarget = await target()
    await mkdir(resolvePromptDirectory(configTarget), { recursive: true })
    await writeFile(path.join(resolvePromptDirectory(configTarget), "notes.json"), "{}")
    await writeFile(path.join(resolvePromptDirectory(configTarget), "prompt.txt"), "plain text")

    expect((await listPromptFiles(configTarget)).map((file) => file.fileName)).toEqual(["prompt.txt"])
  })
})
