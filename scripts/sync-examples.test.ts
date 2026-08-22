import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RENDERER_FAILURE_COLOR } from '../examples/_shared/renderStartupError'

const ROOT = resolve(import.meta.dirname, '..')

function channel(hex: string): number {
  const srgb = Number.parseInt(hex, 16) / 255
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
}

function luminance(color: string): number {
  const hex = color.slice(1)
  return 0.2126 * channel(hex.slice(0, 2)) + 0.7152 * channel(hex.slice(2, 4)) + 0.0722 * channel(hex.slice(4, 6))
}

function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((left, right) => right - left)
  return (lighter + 0.05) / (darker + 0.05)
}

function rendererPages(): string[] {
  return [join(ROOT, 'examples', 'react'), join(ROOT, 'examples', 'three'), join(ROOT, 'benchmarks')].flatMap((root) =>
    readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(root, entry.name, 'index.html'))
  )
}

describe('synced renderer fallbacks', () => {
  it.each(rendererPages())('keeps failure text readable against %s', (path) => {
    const html = readFileSync(path, 'utf8')
    const background = html.match(/background(?:-color)?\s*:\s*(#[\da-f]{6})/i)?.[1]

    expect(background, `${path} must declare a solid page background`).toBeDefined()
    expect(contrastRatio(RENDERER_FAILURE_COLOR, background!), path).toBeGreaterThanOrEqual(4.5)
  })

  it.each(
    readdirSync(join(ROOT, 'examples', 'react'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(ROOT, 'examples', 'react', entry.name, 'App.tsx'))
  )('uses the native R3F Canvas failure boundary in %s', (path) => {
    const source = readFileSync(path, 'utf8')

    expect(source).toContain('fallback=')
    expect(source).toContain('This example could not initialize rendering.')
    expect(source).not.toContain('WebGPUFallback')
  })
})
