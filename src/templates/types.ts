import type { EndpointKind, ModelDraft } from "../core/types.js"

export type ModelFamilyTemplate = {
  family: string
  match: RegExp
  model: ModelDraft
}

export type EndpointTemplate = {
  kind: EndpointKind
  label: string
  recommendedNpm: string
  baseURLHint?: string
  supportsModelProbe: boolean
  genericModel: ModelDraft
  families: ModelFamilyTemplate[]
}
