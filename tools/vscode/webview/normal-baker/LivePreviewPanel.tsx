import { useEffect, useRef, useState } from 'react'
import * as stylex from '@stylexjs/stylex'
import { Panel } from '@three-flatland/design-system'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { space } from '@three-flatland/design-system/tokens/space.stylex'
import type { NormalSourceDescriptor } from '@three-flatland/normals'
import { bakePreviewNormalMap, computeLitComposite, orbitingLight } from './preview'

// No file I/O — this is a purely in-memory preview. Debounces the bake
// on every descriptor/pixel change (region edits, default edits, drag-in-
// progress geometry) so a fast drag doesn't re-bake every frame; the lit
// composite then runs its own independent rAF loop off the LAST baked
// normal map so the light can keep orbiting between bakes.

const BAKE_DEBOUNCE_MS = 200

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = () => setReduced(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return reduced
}

const s = stylex.create({
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.md,
    padding: space.lg,
  },
  slot: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.xs,
  },
  label: {
    color: vscode.descriptionFg,
    fontSize: '11px',
    fontFamily: vscode.monoFontFamily,
  },
  canvasWrap: {
    position: 'relative',
    width: '100%',
    aspectRatio: '1',
    backgroundColor: vscode.bg,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: vscode.panelBorder,
    overflow: 'hidden',
  },
  canvas: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    imageRendering: 'pixelated',
  },
  empty: {
    color: vscode.descriptionFg,
    fontSize: '12px',
  },
})

export type LivePreviewPanelProps = {
  imageData: ImageData | null
  descriptor: NormalSourceDescriptor
}

export function LivePreviewPanel({ imageData, descriptor }: LivePreviewPanelProps) {
  const reducedMotion = usePrefersReducedMotion()
  const normalCanvasRef = useRef<HTMLCanvasElement>(null)
  const litCanvasRef = useRef<HTMLCanvasElement>(null)
  const [baked, setBaked] = useState<{ data: Uint8Array; w: number; h: number } | null>(null)

  // Debounced bake — the live-preview normal map, recomputed via the
  // exact same `bakeNormalMap` the CLI/loader use (see ./preview.ts).
  useEffect(() => {
    if (!imageData) {
      setBaked(null)
      return
    }
    const timer = setTimeout(() => {
      const data = bakePreviewNormalMap(
        imageData.data,
        imageData.width,
        imageData.height,
        descriptor
      )
      setBaked({ data, w: imageData.width, h: imageData.height })
    }, BAKE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [imageData, descriptor])

  // Normal-map canvas — redrawn whenever a new bake lands.
  useEffect(() => {
    const canvas = normalCanvasRef.current
    if (!canvas || !baked) return
    canvas.width = baked.w
    canvas.height = baked.h
    const ctx = canvas.getContext('2d')
    ctx?.putImageData(new ImageData(new Uint8ClampedArray(baked.data), baked.w, baked.h), 0, 0)
  }, [baked])

  // Lit-composite canvas — its own rAF loop so the light keeps orbiting
  // between bakes. Reduced motion pins the light (single static frame,
  // loop never re-schedules itself).
  useEffect(() => {
    const canvas = litCanvasRef.current
    if (!canvas || !baked) return
    canvas.width = baked.w
    canvas.height = baked.h
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = (now - start) / 1000
      const light = orbitingLight(t, { reducedMotion })
      const lit = computeLitComposite(baked.data, light)
      // Re-wrap: a `Uint8ClampedArray` built via `new Uint8ClampedArray(length)`
      // (as `computeLitComposite` does) types its backing buffer as the
      // broader `ArrayBufferLike`, which `ImageData`'s constructor
      // rejects — copying into a fresh array narrows it back to `ArrayBuffer`.
      ctx.putImageData(new ImageData(new Uint8ClampedArray(lit), baked.w, baked.h), 0, 0)
      if (!reducedMotion) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [baked, reducedMotion])

  return (
    <Panel title="Preview" bodyOverflow="visible">
      {!imageData ? (
        <div {...stylex.props(s.empty)}>Waiting for source image…</div>
      ) : (
        <div {...stylex.props(s.body)}>
          <div {...stylex.props(s.slot)}>
            <span {...stylex.props(s.label)}>Normal map</span>
            <div {...stylex.props(s.canvasWrap)}>
              <canvas ref={normalCanvasRef} {...stylex.props(s.canvas)} />
            </div>
          </div>
          <div {...stylex.props(s.slot)}>
            <span {...stylex.props(s.label)}>Lit (rotating light)</span>
            <div {...stylex.props(s.canvasWrap)}>
              <canvas ref={litCanvasRef} {...stylex.props(s.canvas)} />
            </div>
          </div>
        </div>
      )}
    </Panel>
  )
}
