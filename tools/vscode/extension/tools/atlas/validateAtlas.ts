// Re-export of the centralized atlas validator. The authoritative
// implementation lives in packages/three-flatland/src/sprites/atlas.schema.ts
// so the runtime, future tools, and this extension all share one ajv compile
// and one format-uniqueness check.
export {
  validateAtlas,
  assertValidAtlas,
  formatAtlasErrors,
} from 'three-flatland/sprites/atlas'
