import { useEffect } from "react"

export type TuiMouseEvent =
  | { kind: "press"; button: "left" | "right" | "middle"; x: number; y: number }
  | { kind: "release"; button: "left" | "right" | "middle"; x: number; y: number }
  | { kind: "wheel"; button: "wheel-up" | "wheel-down"; x: number; y: number }

export function parseTuiMouseEvent(input: string): TuiMouseEvent | undefined {
  const match = /^\u001B?\[<(\d+);(\d+);(\d+)([mM])$/.exec(input)
  if (!match) return undefined
  const code = Number(match[1])
  const x = Number(match[2])
  const y = Number(match[3])
  const suffix = match[4]
  if (!Number.isFinite(code) || !Number.isFinite(x) || !Number.isFinite(y)) return undefined

  if (code === 64) return { kind: "wheel", button: "wheel-up", x, y }
  if (code === 65) return { kind: "wheel", button: "wheel-down", x, y }

  const button = code % 3 === 0 ? "left" : code % 3 === 1 ? "middle" : "right"
  return { kind: suffix === "m" ? "release" : "press", button, x, y }
}

export function useMouseCapture(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !process.stdin.isTTY) return
    process.stdout.write("\u001B[?1000h\u001B[?1006h")
    return () => {
      process.stdout.write("\u001B[?1000l\u001B[?1006l")
    }
  }, [enabled])
}
