import React, { createContext, useContext, type ReactNode } from "react"

export type TuiThemeName = "opencode" | "system"

export type TuiTheme = {
  name: TuiThemeName
  colors: {
    brand: string
    primary: string
    accent: string
    selected: string
    muted: string
    warning: string
    error: string
    success: string
    border: string
    background: string
    highlight: string
    highlightText: string
    section: string
    shortcut: string
    diffAdd: string
    diffRemove: string
    diffMeta: string
  }
  symbols: {
    selected: string
    unselected: string
    checked: string
    unchecked: string
    disabled: string
  }
}

const opencodeTheme: TuiTheme = {
  name: "opencode",
  colors: {
    brand: "cyan",
    primary: "white",
    accent: "magenta",
    selected: "green",
    muted: "gray",
    warning: "yellow",
    error: "red",
    success: "green",
    border: "gray",
    background: "#111111",
    highlight: "#ffb86c",
    highlightText: "black",
    section: "#b48cff",
    shortcut: "gray",
    diffAdd: "green",
    diffRemove: "red",
    diffMeta: "cyan",
  },
  symbols: {
    selected: ">",
    unselected: " ",
    checked: "x",
    unchecked: " ",
    disabled: "-",
  },
}

const systemTheme: TuiTheme = {
  ...opencodeTheme,
  name: "system",
  colors: {
    ...opencodeTheme.colors,
    brand: "white",
    primary: "white",
    accent: "blue",
    section: "blue",
  },
}

export function isTuiThemeName(value: unknown): value is TuiThemeName {
  return value === "opencode" || value === "system"
}

export function resolveTuiTheme(name: unknown): TuiTheme {
  if (name === "system") return systemTheme
  return opencodeTheme
}

const TuiThemeContext = createContext<TuiTheme>(opencodeTheme)

export function TuiThemeProvider(props: { themeName?: unknown; children: ReactNode }) {
  return <TuiThemeContext.Provider value={resolveTuiTheme(props.themeName)}>{props.children}</TuiThemeContext.Provider>
}

export function useTuiTheme() {
  return useContext(TuiThemeContext)
}
