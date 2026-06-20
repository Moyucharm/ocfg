import { mkdir, readFile, unlink, writeFile } from "node:fs/promises"
import path from "node:path"
import type { ConfigDocument } from "./types.js"

export type ConfigFileSnapshot = {
  path: string
  exists: boolean
  text?: string
}

function isNotFoundError(caught: unknown) {
  return caught !== null && typeof caught === "object" && "code" in caught && caught.code === "ENOENT"
}

export async function snapshotConfigFile(document: ConfigDocument): Promise<ConfigFileSnapshot> {
  const targetPath = document.target.path
  if (!document.target.exists) return { path: targetPath, exists: false }
  return { path: targetPath, exists: true, text: await readFile(targetPath, "utf8") }
}

export async function snapshotConfigFiles(documents: ConfigDocument[], dryRun = false): Promise<ConfigFileSnapshot[]> {
  if (dryRun) return []

  const snapshots: ConfigFileSnapshot[] = []
  const seen = new Set<string>()
  for (const document of documents) {
    if (seen.has(document.target.path)) continue
    seen.add(document.target.path)
    snapshots.push(await snapshotConfigFile(document))
  }
  return snapshots
}

export async function restoreConfigSnapshot(snapshot: ConfigFileSnapshot) {
  if (snapshot.exists) {
    await mkdir(path.dirname(snapshot.path), { recursive: true })
    await writeFile(snapshot.path, snapshot.text ?? "", "utf8")
    return
  }

  await unlink(snapshot.path).catch((caught: unknown) => {
    if (isNotFoundError(caught)) return
    throw caught
  })
}

export async function rollbackConfigFileBatch(configSnapshots: ConfigFileSnapshot[], rollbacks: Array<() => Promise<void>>) {
  for (const rollback of [...rollbacks].reverse()) await rollback()
  for (const snapshot of [...configSnapshots].reverse()) await restoreConfigSnapshot(snapshot)
}
