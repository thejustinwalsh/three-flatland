export type CameraPose = {
  position: [number, number, number]
  lookAt: [number, number, number]
  zoom: number
}

export type SceneBeat = {
  camera: CameraPose
}

export function resolveBeat<T extends SceneBeat>(beats: readonly T[], index: number): T {
  if (beats.length === 0) throw new Error('resolveBeat: beats is empty')
  const clamped = Math.max(0, Math.min(index, beats.length - 1))
  return beats[clamped]!
}
