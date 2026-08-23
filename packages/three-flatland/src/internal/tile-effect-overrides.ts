export function resolveTileEffectComponent(
  properties: Record<string, unknown> | undefined,
  fieldName: string,
  size: number,
  component: number,
  baseline: number
): number {
  if (!properties) return baseline
  const descriptor = Object.getOwnPropertyDescriptor(properties, fieldName)
  if (!descriptor || !('value' in descriptor)) return baseline
  const value = descriptor.value
  const candidate = size === 1 ? value : Array.isArray(value) ? value[component] : undefined
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : baseline
}
