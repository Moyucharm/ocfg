import React, { createContext, useContext, type ReactNode } from "react"
import { printableInput } from "./input.js"

export type TuiKeybindAction =
  | "up"
  | "down"
  | "left"
  | "right"
  | "confirm"
  | "back"
  | "cancel"
  | "quit"
  | "toggle"
  | "toggleAll"
  | "manual"
  | "retry"
  | "delete"
  | "restore"
  | "save"
  | "diff"

export type TuiKeybindMap = Record<TuiKeybindAction, string[]>

export type InkInputKey = {
  upArrow?: boolean
  downArrow?: boolean
  leftArrow?: boolean
  rightArrow?: boolean
  return?: boolean
  escape?: boolean
  backspace?: boolean
  delete?: boolean
  tab?: boolean
  ctrl?: boolean
}

export const defaultTuiKeybinds: TuiKeybindMap = {
  up: ["up"],
  down: ["down"],
  left: ["left"],
  right: ["right"],
  confirm: ["return", "enter"],
  back: ["escape", "b"],
  cancel: ["escape", "ctrl+q"],
  quit: ["q"],
  toggle: ["space"],
  toggleAll: ["a"],
  manual: ["m"],
  retry: ["r"],
  delete: ["d"],
  restore: ["r"],
  save: ["y"],
  diff: ["d"],
}

function normalizeBinding(value: string) {
  const normalized = value.trim().toLowerCase()
  if (normalized === "esc") return "escape"
  if (normalized === "arrowup") return "up"
  if (normalized === "arrowdown") return "down"
  if (normalized === "arrowleft") return "left"
  if (normalized === "arrowright") return "right"
  if (normalized === " " || normalized === "spacebar") return "space"
  return normalized
}

export function resolveTuiKeybinds(overrides: unknown): TuiKeybindMap {
  const next: TuiKeybindMap = { ...defaultTuiKeybinds }
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) return next

  for (const action of Object.keys(defaultTuiKeybinds) as TuiKeybindAction[]) {
    const value = (overrides as Record<string, unknown>)[action]
    if (typeof value === "string" && value.trim()) next[action] = [normalizeBinding(value)]
    if (Array.isArray(value)) {
      const bindings = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map(normalizeBinding)
      if (bindings.length > 0) next[action] = bindings
    }
  }

  return next
}

export function inputBindings(input: string, key: InkInputKey): string[] {
  const bindings: string[] = []
  if (key.upArrow) bindings.push("up")
  if (key.downArrow) bindings.push("down")
  if (key.leftArrow) bindings.push("left")
  if (key.rightArrow) bindings.push("right")
  if (key.return) bindings.push("return", "enter")
  if (key.escape) bindings.push("escape")
  if (key.backspace) bindings.push("backspace")
  if (key.delete) bindings.push("delete")
  if (key.tab) bindings.push("tab")
  if (input === " ") bindings.push("space")

  const printable = printableInput(input)
  if (printable) {
    const lower = printable.toLowerCase()
    bindings.push(lower)
    if (key.ctrl) bindings.push(`ctrl+${lower}`)
  }

  return Array.from(new Set(bindings.map(normalizeBinding)))
}

export function matchesKeybind(action: TuiKeybindAction, input: string, key: InkInputKey, keybinds: TuiKeybindMap = defaultTuiKeybinds) {
  const active = new Set(inputBindings(input, key))
  return keybinds[action].some((binding) => active.has(normalizeBinding(binding)))
}

export function formatKeybind(action: TuiKeybindAction, keybinds: TuiKeybindMap = defaultTuiKeybinds) {
  return keybinds[action].join("/")
}

const TuiKeybindContext = createContext<TuiKeybindMap>(defaultTuiKeybinds)

export function TuiKeybindProvider(props: { keybinds?: TuiKeybindMap; children: ReactNode }) {
  return <TuiKeybindContext.Provider value={props.keybinds ?? defaultTuiKeybinds}>{props.children}</TuiKeybindContext.Provider>
}

export function useTuiKeybinds() {
  return useContext(TuiKeybindContext)
}
