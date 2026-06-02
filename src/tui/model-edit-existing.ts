import { isRecord } from "../core/object-utils.js"
import type { ModelDraft } from "../core/types.js"
import { gpt5LimitForLongContext } from "../core/model-limit-presets.js"

export class ModelEditDraftError extends Error {}

export type ExistingModelEditDraft = {
  name?: string
  context?: number
  input?: number
  output?: number
  gpt5LongContext?: boolean
  reasoning?: boolean
  toolCall?: boolean
  temperature?: boolean
  attachment?: boolean
}

function existingNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function assertPositiveInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value <= 0) throw new ModelEditDraftError(`${label} must be a positive integer`)
}

export function buildExistingModelEditPatch(current: Record<string, unknown>, draft: ExistingModelEditDraft): Partial<ModelDraft> {
  const patch: Partial<ModelDraft> = {}

  if (draft.name !== undefined) patch.name = draft.name
  if (draft.reasoning !== undefined) patch.reasoning = draft.reasoning
  if (draft.toolCall !== undefined) patch.tool_call = draft.toolCall
  if (draft.temperature !== undefined) patch.temperature = draft.temperature
  if (draft.attachment !== undefined) patch.attachment = draft.attachment

  if (draft.gpt5LongContext !== undefined) patch.limit = gpt5LimitForLongContext(draft.gpt5LongContext)

  if (draft.context !== undefined || draft.input !== undefined || draft.output !== undefined) {
    if (draft.context !== undefined) assertPositiveInteger(draft.context, "context")
    if (draft.input !== undefined) assertPositiveInteger(draft.input, "input")
    if (draft.output !== undefined) assertPositiveInteger(draft.output, "output")

    const currentLimit = patch.limit ?? (isRecord(current.limit) ? current.limit : undefined)
    const context = draft.context ?? existingNumber(currentLimit?.context)
    const input = draft.input ?? existingNumber(currentLimit?.input)
    const output = draft.output ?? existingNumber(currentLimit?.output)
    if (context === undefined || output === undefined) {
      throw new ModelEditDraftError("context and output are both required when the model has no complete limit")
    }
    patch.limit = { context, ...(input === undefined ? {} : { input }), output }
  }

  return patch
}
