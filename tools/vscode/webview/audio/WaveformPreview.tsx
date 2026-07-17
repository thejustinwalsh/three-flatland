import { useCallback, useEffect, useRef, useState } from 'react'
import * as stylex from '@stylexjs/stylex'
import { Panel, useCssVar } from '@three-flatland/design-system'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { synthesizeSamples, type PlaybackHandle } from './audio'
import { bucketWaveform, type WaveformBuckets } from './waveformPath'
import type { ZzfxParams } from './params'

// Coalesces slider-drag bursts into one synth+draw — same trailing-edge
// window the stores use for undo coalescing (below human reaction time,
// invisible for isolated changes).
const REDRAW_DEBOUNCE_MS = 100

const s = stylex.create({
  // Fixed-height strip — an instrument readout, not a resizable chart.
  canvas: {
    display: 'block',
    width: '100%',
    height: 56,
  },
  readout: {
    fontFamily: vscode.monoFontFamily,
    fontSize: '10px',
    color: vscode.descriptionFg,
    // Panel headers uppercase their content; "0.42s" must stay lowercase.
    textTransform: 'none',
    letterSpacing: 'normal',
    whiteSpace: 'nowrap',
  },
})

type TraceColors = { trace: string; zero: string }

/**
 * Renders `buckets` into the canvas's device-pixel backing store with an
 * identity transform — one bucket per device pixel column, so the trace
 * stays crisp on any DPR instead of being upscaled from CSS pixels.
 */
function drawTrace(
  canvas: HTMLCanvasElement,
  buckets: WaveformBuckets,
  colors: TraceColors,
  playheadProgress: number | null
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { width: w, height: h } = canvas
  const dpr = window.devicePixelRatio || 1
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, w, h)

  const mid = h / 2
  const amp = mid - Math.max(1, Math.round(dpr * 2))

  // Zero line: descriptionFg, low opacity, one device pixel — a hairline.
  ctx.globalAlpha = 0.35
  ctx.fillStyle = colors.zero
  ctx.fillRect(0, Math.round(mid), w, 1)
  ctx.globalAlpha = 1

  ctx.fillStyle = colors.trace
  const cols = Math.min(buckets.max.length, w)
  for (let x = 0; x < cols; x++) {
    const top = mid - buckets.max[x]! * amp
    const bottom = mid - buckets.min[x]! * amp
    ctx.fillRect(x, top, 1, Math.max(1, bottom - top))
  }

  if (playheadProgress !== null) {
    const x = Math.min(Math.round(playheadProgress * w), w - 1)
    ctx.fillRect(x, 0, Math.max(1, Math.round(dpr)), h)
  }
}

function formatGain(gain: number): string {
  return gain >= 10 ? String(Math.round(gain)) : gain.toFixed(1)
}

export type WaveformPreviewProps = {
  params: ZzfxParams
  /** The most recent toolbar-Play playback of exactly these params, or
   * null — drives the playhead sweep. Host-pushed `zzfx/play` events play
   * arbitrary params and deliberately never reach this. */
  playback: PlaybackHandle | null
}

/**
 * Amplitude trace of the sound the current params synthesize — the same
 * `buildSamples` buffer `playParams` plays, min/max-bucketed per device
 * pixel (waveformPath.ts). Header readout shows the applied normalization
 * gain (when it meaningfully differs from ×1) and the sound's duration.
 */
export function WaveformPreview({ params, playback }: WaveformPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const samplesRef = useRef<Float32Array | null>(null)
  const bucketsRef = useRef<{ width: number; buckets: WaveformBuckets } | null>(null)
  const generationRef = useRef(0)
  const [meta, setMeta] = useState<{ gain: number; duration: number } | null>(null)

  // Canvas 2D needs concrete color strings, not CSS classes — useCssVar is
  // the design system's sanctioned escape hatch for exactly this (it stays
  // reactive to theme switches). Same vars vscode.fg / vscode.descriptionFg
  // map to; there are no charts.* tokens in the theme bridge yet.
  const traceColor = useCssVar('--vscode-foreground', '#cccccc')
  const zeroColor = useCssVar('--vscode-descriptionForeground', '#888888')
  const colorsRef = useRef<TraceColors>({ trace: traceColor, zero: zeroColor })
  colorsRef.current = { trace: traceColor, zero: zeroColor }

  const redraw = useCallback((playheadProgress: number | null = null): WaveformBuckets | null => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const dpr = window.devicePixelRatio || 1
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr))
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    let cached = bucketsRef.current
    if (!cached || cached.width !== w) {
      cached = { width: w, buckets: bucketWaveform(samplesRef.current ?? [], w) }
      bucketsRef.current = cached
    }
    drawTrace(canvas, cached.buckets, colorsRef.current, playheadProgress)
    // e2e observable — written only after the trace has actually been
    // drawn, so "attribute reports a nonzero peak" means "real samples
    // were synthesized AND rendered", not just "the component mounted".
    canvas.dataset.waveformPeak = String(cached.buckets.peak)
    return cached.buckets
  }, [])

  // Debounced synth on any param change — candidate/preset applies mutate
  // the same `params` object upstream, so one effect covers both.
  useEffect(() => {
    const generation = ++generationRef.current
    const timer = setTimeout(() => {
      void synthesizeSamples(params).then(
        ({ samples, sampleRate }) => {
          if (generationRef.current !== generation) return
          samplesRef.current = samples
          bucketsRef.current = null
          const drawn = redraw()
          setMeta({
            gain: drawn?.gain ?? 1,
            duration: sampleRate > 0 ? samples.length / sampleRate : 0,
          })
        },
        () => {
          // Synthesis failing (zzfx import blocked, etc.) is non-fatal to
          // the editor — the strip just stays empty; Play surfaces its own
          // error through the existing banner path.
        }
      )
    }, REDRAW_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [params, redraw])

  // Panel/splitter resizes change the device-pixel width — rebucket + redraw.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const observer = new ResizeObserver(() => redraw())
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [redraw])

  // Theme switches swap the resolved colors — redraw with the new ones.
  useEffect(() => {
    redraw()
  }, [traceColor, zeroColor, redraw])

  // Playhead sweep, timed against the AudioContext's own clock (not
  // wall-clock) so it tracks actual playback. Reduced motion: no sweep —
  // the trace itself is the readout.
  useEffect(() => {
    if (!playback || !(playback.duration > 0)) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = requestAnimationFrame(function tick() {
      const progress = (playback.context.currentTime - playback.startedAt) / playback.duration
      if (progress >= 1) {
        redraw(null)
        return
      }
      redraw(Math.max(0, progress))
      raf = requestAnimationFrame(tick)
    })
    return () => {
      cancelAnimationFrame(raf)
      redraw(null)
    }
  }, [playback, redraw])

  return (
    <Panel
      title="Waveform"
      bodyPadding="none"
      bodyOverflow="visible"
      headerActions={
        meta && (
          <span {...stylex.props(s.readout)}>
            {Math.abs(meta.gain - 1) > 0.05 ? `×${formatGain(meta.gain)} · ` : ''}
            {meta.duration.toFixed(2)}s
          </span>
        )
      }
    >
      <canvas ref={canvasRef} role="img" aria-label="Waveform preview" {...stylex.props(s.canvas)} />
    </Panel>
  )
}
