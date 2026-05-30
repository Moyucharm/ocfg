import { isRecord } from "./object-utils.js"

export const OPENCODE_EXA_ENV = "OPENCODE_ENABLE_EXA"

const trueValues = new Set(["1", "true", "yes", "on"])

export function isExaSearchEnvEnabled(value?: string) {
  const resolved = arguments.length === 0 ? process.env[OPENCODE_EXA_ENV] : value
  return typeof resolved === "string" && trueValues.has(resolved.trim().toLowerCase())
}

export function hasExaSearchPermissions(config: Record<string, unknown>) {
  const permission = config.permission
  if (permission === "allow") return true
  if (!isRecord(permission)) return false
  return permission.websearch === "allow" && permission.webfetch === "allow"
}

export function isExaSearchEnabled(config: Record<string, unknown>, value?: string) {
  return (arguments.length === 1 ? isExaSearchEnvEnabled() : isExaSearchEnvEnabled(value)) && hasExaSearchPermissions(config)
}

export function enableExaSearchPermissions(config: Record<string, unknown>) {
  const permission = config.permission
  if (permission === "allow") return config
  if (typeof permission === "string") {
    throw new Error(`Cannot safely enable websearch when top-level permission is "${permission}". Replace permission with an object first.`)
  }
  if (permission !== undefined && !isRecord(permission)) {
    throw new Error("Cannot safely enable websearch because top-level permission is not an object.")
  }

  const nextPermission = {
    ...(isRecord(permission) ? permission : {}),
    websearch: "allow",
    webfetch: "allow",
  }

  if (isRecord(permission) && permission.websearch === "allow" && permission.webfetch === "allow") return config
  return { ...config, permission: nextPermission }
}
