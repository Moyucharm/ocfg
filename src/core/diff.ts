export function stringifyConfig(config: Record<string, unknown>): string {
  return `${JSON.stringify(config, null, 2)}\n`
}

export function createConfigDiff(beforeText: string, afterText: string): string {
  if (beforeText === afterText) return "No changes."

  const beforeLines = beforeText.length > 0 ? beforeText.split("\n") : []
  const afterLines = afterText.length > 0 ? afterText.split("\n") : []
  const max = Math.max(beforeLines.length, afterLines.length)
  const output: string[] = []

  for (let index = 0; index < max; index += 1) {
    const before = beforeLines[index]
    const after = afterLines[index]
    if (before === after) continue
    if (before !== undefined) output.push(`- ${before}`)
    if (after !== undefined) output.push(`+ ${after}`)
  }

  return output.join("\n")
}
