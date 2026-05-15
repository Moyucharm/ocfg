import { chmod, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

export type SecretFileSnapshot =
  | { existed: false; path: string }
  | { existed: true; path: string; value: Buffer; mode: number }

function safeProviderFileName(providerID: string) {
  return providerID
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

function defaultHome() {
  return process.env.HOME || os.homedir()
}

function usesWindowsPath(home: string) {
  return /^[a-zA-Z]:[\\/]/.test(home) || home.includes("\\")
}

function joinHomePath(home: string, ...parts: string[]) {
  return usesWindowsPath(home) ? path.win32.join(home, ...parts) : path.posix.join(home, ...parts)
}

export function expandHomePath(filePath: string, home = defaultHome()) {
  if (filePath === "~") return home
  if (filePath.startsWith("~/") || filePath.startsWith("~\\")) return joinHomePath(home, filePath.slice(2))
  return filePath
}

export function defaultSecretFilePath(providerID: string, home = "~") {
  const fileName = safeProviderFileName(providerID)
  if (!fileName) throw new Error("Provider ID is required to create a secret file path")
  return joinHomePath(home, ".config", "ocfg", "secrets", `${fileName}.api-key`)
}

export async function writeSecretFileSafely(options: { path: string; value: string }): Promise<{ path: string }> {
  const targetPath = expandHomePath(options.path)
  const targetDir = path.dirname(targetPath)
  const tempPath = path.join(targetDir, `.${path.basename(targetPath)}.${process.pid}.${Date.now()}.tmp`)

  await mkdir(targetDir, { recursive: true, mode: 0o700 })
  await chmod(targetDir, 0o700)
  await writeFile(tempPath, options.value, { mode: 0o600 })
  await chmod(tempPath, 0o600)
  await rename(tempPath, targetPath)
  await chmod(targetPath, 0o600)

  return { path: options.path }
}

export async function snapshotSecretFile(filePath: string): Promise<SecretFileSnapshot> {
  const targetPath = expandHomePath(filePath)
  try {
    const [stats, value] = await Promise.all([stat(targetPath), readFile(targetPath)])
    return { existed: true, path: filePath, value, mode: stats.mode & 0o777 }
  } catch (caught) {
    if (caught && typeof caught === "object" && "code" in caught && caught.code === "ENOENT") return { existed: false, path: filePath }
    throw caught
  }
}

export async function restoreSecretFile(snapshot: SecretFileSnapshot): Promise<void> {
  const targetPath = expandHomePath(snapshot.path)
  if (!snapshot.existed) {
    await rm(targetPath, { force: true })
    return
  }
  await mkdir(path.dirname(targetPath), { recursive: true, mode: 0o700 })
  await writeFile(targetPath, snapshot.value, { mode: snapshot.mode })
  await chmod(targetPath, snapshot.mode)
}
