import { useInput, useStdin } from "ink"

type InputHandler = Parameters<typeof useInput>[0]

export function printableInput(input: string) {
  const printable = input.replace(/[\u0000-\u001F\u007F]/g, "")
  return printable.startsWith("[<") ? "" : printable
}

export function appendPrintableInput(value: string, input: string) {
  return `${value}${printableInput(input)}`
}

export function removeLastChar(value: string) {
  return Array.from(value).slice(0, -1).join("")
}

export function useTuiInput(handler: InputHandler) {
  const { isRawModeSupported } = useStdin()
  useInput(handler, { isActive: isRawModeSupported === true })
}
