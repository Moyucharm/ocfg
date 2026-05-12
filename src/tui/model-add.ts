import type { DetectedModel } from "../core/model-detector.js"

export function configuredModelIDs(provider: Record<string, unknown>) {
  const models = provider.models
  if (!models || typeof models !== "object" || Array.isArray(models)) return new Set<string>()
  return new Set(Object.keys(models))
}

export function splitExistingModelIDs(modelIDs: string[], existingModelIDs: Set<string>) {
  const newModelIDs: string[] = []
  const alreadyAdded: string[] = []

  for (const modelID of modelIDs) {
    if (existingModelIDs.has(modelID)) alreadyAdded.push(modelID)
    else newModelIDs.push(modelID)
  }

  return { newModelIDs, alreadyAdded }
}

export function selectableDetectedModels(models: DetectedModel[], existingModelIDs: Set<string>) {
  return models.filter((model) => !existingModelIDs.has(model.id)).map((model) => model.id)
}
