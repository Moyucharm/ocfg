import React, { createContext, useCallback, useContext, useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react"
import { openCodeMenuRows, type OpenCodeMenuGroup, type OpenCodeMenuRow } from "./ui.js"

export type TuiMenuMemoryEntry = {
  selectedIndex: number
  selectedItemId?: string
}

type OpenCodeMenuItemRow = Extract<OpenCodeMenuRow, { kind: "item" }>
type TuiMenuMemoryStore = Map<string, TuiMenuMemoryEntry>

const fallbackMenuMemoryStore: TuiMenuMemoryStore = new Map()
const TuiMenuMemoryContext = createContext<TuiMenuMemoryStore | undefined>(undefined)

function menuItemRows(groups: OpenCodeMenuGroup[], query = "") {
  return openCodeMenuRows(groups, query).filter((row): row is OpenCodeMenuItemRow => row.kind === "item")
}

function normalizedIndex(index: number) {
  return Number.isFinite(index) ? Math.trunc(index) : 0
}

function clampSelectedIndex(index: number, count: number) {
  if (count <= 0) return 0
  return Math.max(0, Math.min(normalizedIndex(index), count - 1))
}

export function resolveRememberedOpenCodeMenuSelection(options: {
  groups: OpenCodeMenuGroup[]
  query?: string
  entry?: TuiMenuMemoryEntry
  fallbackIndex?: number
}) {
  const rows = menuItemRows(options.groups, options.query)
  if (rows.length === 0) return 0

  if (options.entry?.selectedItemId) {
    const rememberedRow = rows.find((row) => row.item.id === options.entry?.selectedItemId)
    if (rememberedRow) return rememberedRow.itemIndex
  }

  return clampSelectedIndex(options.entry?.selectedIndex ?? options.fallbackIndex ?? 0, rows.length)
}

export function createRememberedOpenCodeMenuEntry(options: {
  groups: OpenCodeMenuGroup[]
  query?: string
  selectedIndex: number
  previousEntry?: TuiMenuMemoryEntry
}): TuiMenuMemoryEntry {
  const rows = menuItemRows(options.groups, options.query)
  const selectedIndex = clampSelectedIndex(options.selectedIndex, rows.length)
  const selectedRow = rows.find((row) => row.itemIndex === selectedIndex)
  return {
    selectedIndex,
    selectedItemId: selectedRow?.item.id ?? options.previousEntry?.selectedItemId,
  }
}

export function TuiMenuMemoryProvider(props: { children: ReactNode }) {
  const store = useRef<TuiMenuMemoryStore>(new Map())
  return <TuiMenuMemoryContext.Provider value={store.current}>{props.children}</TuiMenuMemoryContext.Provider>
}

export function useRememberedOpenCodeMenuSelection(options: {
  memoryKey: string
  groups: OpenCodeMenuGroup[]
  query?: string
  initialSelected?: number
  ready?: boolean
}): {
  selected: number
  setSelected: Dispatch<SetStateAction<number>>
  rememberSelected: (index?: number) => void
} {
  const store = useContext(TuiMenuMemoryContext) ?? fallbackMenuMemoryStore
  const query = options.query ?? ""
  const ready = options.ready ?? true
  const initialSelected = options.initialSelected ?? 0
  const [selected, setSelected] = useState(() => store.get(options.memoryKey)?.selectedIndex ?? initialSelected)
  const restoredKey = useRef<string | undefined>(undefined)
  const rows = menuItemRows(options.groups, query)
  const itemSignature = rows.map((row) => row.item.id).join("\0")

  const rememberSelected = useCallback((index = selected) => {
    const previousEntry = store.get(options.memoryKey)
    store.set(options.memoryKey, createRememberedOpenCodeMenuEntry({
      groups: options.groups,
      query,
      selectedIndex: index,
      previousEntry,
    }))
  }, [options.groups, options.memoryKey, query, selected, store])

  useEffect(() => {
    if (!ready) {
      restoredKey.current = undefined
      return
    }
    if (restoredKey.current === options.memoryKey) return
    setSelected(resolveRememberedOpenCodeMenuSelection({
      groups: options.groups,
      query,
      entry: store.get(options.memoryKey),
      fallbackIndex: initialSelected,
    }))
    restoredKey.current = options.memoryKey
  }, [initialSelected, options.memoryKey, ready, store])

  useEffect(() => {
    if (!ready) return
    setSelected((current) => clampSelectedIndex(current, rows.length))
  }, [itemSignature, ready, rows.length])

  useEffect(() => {
    if (!ready) return
    const previousEntry = store.get(options.memoryKey)
    store.set(options.memoryKey, createRememberedOpenCodeMenuEntry({
      groups: options.groups,
      query,
      selectedIndex: selected,
      previousEntry,
    }))
  }, [itemSignature, options.memoryKey, ready, selected, store])

  return { selected, setSelected, rememberSelected }
}
