import { useInput, useStdin } from "ink"

type InputHandler = Parameters<typeof useInput>[0]

export function useTuiInput(handler: InputHandler) {
  const { isRawModeSupported } = useStdin()
  useInput(handler, { isActive: isRawModeSupported === true })
}
