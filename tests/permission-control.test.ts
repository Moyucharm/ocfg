import { describe, expect, test } from "vitest"
import { parse } from "jsonc-parser"
import { applyPermissionEdit, applyPermissionText, collectPermissionAgentIDs, gitSensitiveBashRules, permissionKeys, permissionValueSummary } from "../src/core/permission-control.js"
import type { ConfigDocument } from "../src/core/types.js"

function doc(text: string): ConfigDocument {
  return {
    target: { scope: "project", path: "/tmp/opencode.jsonc", exists: true, format: "jsonc" },
    text,
    data: parse(text) as Record<string, unknown>,
    diagnostics: [],
  }
}

describe("permission control helpers", () => {
  test("sets a global tool permission while preserving top-level string semantics", () => {
    const next = applyPermissionEdit({ permission: "allow" }, { scope: { type: "global" }, key: "bash", action: "ask" })

    expect(next.permission).toEqual({ "*": "allow", bash: "ask" })
    expect(next.$schema).toBe("https://opencode.ai/config.json")
  })

  test("restores a global permission key by removing it", () => {
    const next = applyPermissionEdit({ permission: { "*": "ask", bash: "allow" } }, { scope: { type: "global" }, key: "bash" })

    expect(next.permission).toEqual({ "*": "ask" })
  })

  test("restores top-level string permission defaults only through the all key", () => {
    expect(applyPermissionEdit({ permission: "deny" }, { scope: { type: "global" }, key: "bash" }).permission).toBe("deny")
    expect(applyPermissionEdit({ permission: "deny" }, { scope: { type: "global" }, key: "*" }).permission).toBeUndefined()
  })

  test("sets and restores agent-specific permissions without dropping other agent fields", () => {
    const input = { agent: { build: { prompt: "./build.md", permission: { bash: "deny" } } } }

    const edited = applyPermissionEdit(input, { scope: { type: "agent", agentID: "build" }, key: "edit", action: "ask" })
    expect(edited.agent).toEqual({ build: { prompt: "./build.md", permission: { bash: "deny", edit: "ask" } } })

    const restored = applyPermissionEdit(edited, { scope: { type: "agent", agentID: "build" }, key: "bash" })
    expect(restored.agent).toEqual({ build: { prompt: "./build.md", permission: { edit: "ask" } } })
  })

  test("includes schema-supported list and todowrite permission keys", () => {
    expect(permissionKeys).toEqual(expect.arrayContaining(["list", "todowrite"]))

    const withList = applyPermissionEdit({}, { scope: { type: "global" }, key: "list", action: "ask" })
    const withTodoWrite = applyPermissionEdit(withList, { scope: { type: "global" }, key: "todowrite", action: "deny" })
    expect(withTodoWrite.permission).toMatchObject({ list: "ask", todowrite: "deny" })

    const withoutList = applyPermissionEdit(withTodoWrite, { scope: { type: "global" }, key: "list" })
    const withoutTodoWrite = applyPermissionEdit(withoutList, { scope: { type: "global" }, key: "todowrite" })
    expect(withoutTodoWrite.permission).toBeUndefined()
  })

  test("restoring the only custom agent permission removes the empty agent", () => {
    const edited = applyPermissionEdit({}, { scope: { type: "agent", agentID: "review" }, key: "edit", action: "deny" })
    const restored = applyPermissionEdit(edited, { scope: { type: "agent", agentID: "review" }, key: "edit" })

    expect(restored.agent).toBeUndefined()
  })

  test("summarizes agent permissions inherited from global config", () => {
    const config = { permission: { "*": "ask", bash: "allow" }, agent: { build: { permission: { edit: "deny" } } } }

    expect(permissionValueSummary(config, { type: "agent", agentID: "build" }, "bash")).toEqual({ kind: "action", action: "allow", source: "inherited" })
    expect(permissionValueSummary(config, { type: "agent", agentID: "build" }, "edit")).toEqual({ kind: "action", action: "deny", source: "direct" })
  })

  test("writes permission edits while preserving JSONC comments", () => {
    const document = doc(`{
  // keep root comment
  "permission": {
    // keep permission comment
    "bash": "ask"
  }
}
`)
    const edit = { scope: { type: "global" as const }, key: "bash" as const, action: "deny" as const }
    const nextConfig = applyPermissionEdit(document.data, edit)
    const nextText = applyPermissionText(document, edit, nextConfig)

    expect(nextText).toContain("// keep root comment")
    expect(nextText).toContain("// keep permission comment")
    expect(parse(nextText).permission.bash).toBe("deny")
  })

  test("collects built-in and configured agent IDs", () => {
    const ids = collectPermissionAgentIDs({ agent: { custom: {}, build: {} } })

    expect(ids.slice(0, 3)).toEqual(["build", "plan", "general"])
    expect(ids).toContain("custom")
  })

  test("applies the Git sensitive bash preset globally", () => {
    const next = applyPermissionEdit({ permission: "allow" }, { scope: { type: "global" }, key: "bash", preset: "apply-git-sensitive-bash" })

    expect(next.permission).toEqual({ "*": "allow", bash: gitSensitiveBashRules })
    expect((next.permission as { bash: Record<string, unknown> }).bash["git branch"]).toBe("allow")
    expect((next.permission as { bash: Record<string, unknown> }).bash["git branch*"]).toBeUndefined()
  })

  test("applies the Git sensitive bash preset to an agent", () => {
    const next = applyPermissionEdit({}, { scope: { type: "agent", agentID: "build" }, key: "bash", preset: "apply-git-sensitive-bash" })

    expect(next.agent).toEqual({ build: { permission: { bash: gitSensitiveBashRules } } })
  })

  test("Git sensitive bash preset keeps custom rules and writes preset rules last", () => {
    const next = applyPermissionEdit({ permission: { bash: { "npm publish*": "ask", "git push*": "deny", "git branch*": "allow" } } }, { scope: { type: "global" }, key: "bash", preset: "apply-git-sensitive-bash" })
    const bash = (next.permission as Record<string, unknown>).bash as Record<string, unknown>

    expect(bash["npm publish*"]).toBe("ask")
    expect(bash["git push*"]).toBe("ask")
    expect(bash["git branch*"]).toBeUndefined()
    expect(Object.keys(bash).slice(-Object.keys(gitSensitiveBashRules).length)).toEqual(Object.keys(gitSensitiveBashRules))
  })

  test("cancels the Git sensitive bash preset without removing custom bash rules", () => {
    const applied = applyPermissionEdit({ permission: { bash: { "npm publish*": "ask" } } }, { scope: { type: "global" }, key: "bash", preset: "apply-git-sensitive-bash" })
    const withLegacyRule = { ...applied, permission: { ...(applied.permission as Record<string, unknown>), bash: { ...((applied.permission as Record<string, Record<string, unknown>>).bash), "git branch*": "allow" } } }
    const cancelled = applyPermissionEdit(withLegacyRule, { scope: { type: "global" }, key: "bash", preset: "cancel-git-sensitive-bash" })

    expect(cancelled.permission).toEqual({ bash: { "npm publish*": "ask" } })
  })

  test("cancels the Git sensitive bash preset and cleans empty permission objects", () => {
    const applied = applyPermissionEdit({}, { scope: { type: "agent", agentID: "review" }, key: "bash", preset: "apply-git-sensitive-bash" })
    const cancelled = applyPermissionEdit(applied, { scope: { type: "agent", agentID: "review" }, key: "bash", preset: "cancel-git-sensitive-bash" })

    expect(cancelled.agent).toBeUndefined()
  })

  test("writes Git sensitive bash preset while preserving JSONC comments", () => {
    const document = doc(`{
  // keep root comment
  "permission": {
    // keep permission comment
    "bash": {
      // keep bash comment
      "npm publish*": "ask"
    }
  }
}
`)
    const edit = { scope: { type: "global" as const }, key: "bash" as const, preset: "apply-git-sensitive-bash" as const }
    const nextConfig = applyPermissionEdit(document.data, edit)
    const nextText = applyPermissionText(document, edit, nextConfig)
    const parsed = parse(nextText)

    expect(nextText).toContain("// keep root comment")
    expect(nextText).toContain("// keep permission comment")
    expect(nextText).toContain("// keep bash comment")
    expect(parsed.permission.bash["npm publish*"]).toBe("ask")
    expect(parsed.permission.bash["git reset --hard*"]).toBe("deny")
  })
})
