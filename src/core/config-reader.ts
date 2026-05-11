import { readFile } from "node:fs/promises"
import { parse, type ParseError, printParseErrorCode } from "jsonc-parser"
import type { ConfigDocument, ConfigTarget, Diagnostic } from "./types.js"

function parseErrorsToDiagnostics(errors: ParseError[]): Diagnostic[] {
  return errors.map((error) => ({
    severity: "high",
    source: "parse",
    path: `offset:${error.offset}`,
    message: `JSONC parse error: ${printParseErrorCode(error.error)} at offset ${error.offset}`,
  }))
}

export async function readConfig(target: ConfigTarget): Promise<ConfigDocument> {
  if (!target.exists) {
    return {
      target,
      text: "",
      data: { $schema: "https://opencode.ai/config.json" },
      diagnostics: [],
    }
  }

  const text = await readFile(target.path, "utf8")
  const errors: ParseError[] = []
  const data = parse(text, errors, { allowTrailingComma: true, disallowComments: false })
  const diagnostics = parseErrorsToDiagnostics(errors)

  return {
    target,
    text,
    data: data && typeof data === "object" && !Array.isArray(data) ? data : {},
    diagnostics,
  }
}
