// Re-export of the centralized atlas validator. The authoritative
// implementation lives in packages/schemas/src/atlas/validator.ts — schema +
// Ajv are siloed there so they never leak into the three-flatland runtime
// bundle. Tools and CI share one ajv compile and one format-uniqueness check.
export {
  validateAtlas,
  assertValidAtlas,
  formatAtlasErrors,
} from '@three-flatland/schemas/atlas'
