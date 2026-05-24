import type { EndpointKind } from "../core/types.js"

export type EndpointTemplate = {
  kind: EndpointKind
  label: string
  recommendedNpm: string
  baseURLHint?: string
  supportsModelProbe: boolean
}
