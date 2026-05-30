import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

export type CommandRunner = (command: string, args: string[]) => Promise<void>

export type UserEnvWriteOptions = {
  home?: string
  platform?: NodeJS.Platform
  shell?: string
  env?: NodeJS.ProcessEnv
  commandRunner?: CommandRunner
}

export type UserEnvWriteResult = {
  variable: string
  value: string
  platform: NodeJS.Platform
  targetPath?: string
  command?: string
  changed: boolean
}

const blockStart = "# >>> ocfg opencode exa"
const blockEnd = "# <<< ocfg opencode exa"
const posixEnvFiles = [".bashrc", ".zshrc", ".profile"]

function defaultCommandRunner(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "ignore" })
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`${command} timed out`))
    }, 5_000)
    child.on("error", (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(`${command} exited with code ${code ?? "unknown"}`))
    })
  })
}

function shellName(shell: string | undefined) {
  return path.basename(shell ?? "").toLowerCase()
}

function preferredPosixEnvPath(options: UserEnvWriteOptions) {
  const home = options.home ?? os.homedir()
  const name = shellName(options.shell ?? options.env?.SHELL ?? process.env.SHELL)
  if (name.includes("zsh")) return path.join(home, ".zshrc")
  if (name.includes("bash")) return path.join(home, ".bashrc")
  if ((options.platform ?? process.platform) === "darwin") return path.join(home, ".zshrc")
  return path.join(home, ".profile")
}

function managedBlock(variable: string, value: string) {
  return `${blockStart}\nexport ${variable}=${value}\n${blockEnd}`
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function managedBlockPattern() {
  return new RegExp(`${escapeRegExp(blockStart)}[\\s\\S]*?${escapeRegExp(blockEnd)}`)
}

function candidatePosixEnvPaths(home: string, preferredPath: string) {
  return Array.from(new Set([preferredPath, ...posixEnvFiles.map((fileName) => path.join(home, fileName))]))
}

async function fileHasManagedBlock(filePath: string) {
  if (!existsSync(filePath)) return false
  const source = await readFile(filePath, "utf8").catch(() => undefined)
  return typeof source === "string" && managedBlockPattern().test(source)
}

async function resolvePosixEnvPath(options: UserEnvWriteOptions) {
  const home = options.home ?? os.homedir()
  const preferredPath = preferredPosixEnvPath(options)
  const pathsWithManagedBlock: string[] = []

  for (const filePath of candidatePosixEnvPaths(home, preferredPath)) {
    if (await fileHasManagedBlock(filePath)) pathsWithManagedBlock.push(filePath)
  }

  if (pathsWithManagedBlock.includes(preferredPath)) return preferredPath
  return pathsWithManagedBlock[0] ?? preferredPath
}

export function updateManagedEnvBlock(source: string, variable: string, value: string) {
  const nextBlock = managedBlock(variable, value)
  const pattern = managedBlockPattern()
  if (pattern.test(source)) return source.replace(pattern, nextBlock)
  const separator = source.length === 0 || source.endsWith("\n") ? "" : "\n"
  return `${source}${separator}${nextBlock}\n`
}

export async function writeUserEnvVar(variable: string, value: string, options: UserEnvWriteOptions = {}): Promise<UserEnvWriteResult> {
  const platform = options.platform ?? process.platform

  if (platform === "win32") {
    await (options.commandRunner ?? defaultCommandRunner)("setx", [variable, value])
    return {
      variable,
      value,
      platform,
      command: `setx ${variable} ${value}`,
      changed: true,
    }
  }

  const targetPath = await resolvePosixEnvPath(options)
  const before = existsSync(targetPath) ? await readFile(targetPath, "utf8") : ""
  const after = updateManagedEnvBlock(before, variable, value)
  const changed = after !== before
  if (changed) {
    await mkdir(path.dirname(targetPath), { recursive: true })
    await writeFile(targetPath, after, "utf8")
  }

  return {
    variable,
    value,
    platform,
    targetPath,
    changed,
  }
}
