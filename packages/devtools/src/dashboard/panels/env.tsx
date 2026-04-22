/** @jsxImportSource preact */
/**
 * Environment popover — compact info chip in the header that opens a
 * floating list of runtime details on click. Lives in the header so it
 * doesn't eat vertical space in the main content area; this info is
 * reference-only, not something you watch tick by tick.
 */
import { useEffect, useRef, useState } from 'preact/hooks'
import { useDevtoolsState } from '../hooks.js'

function fmtMB(v: number | undefined): string {
  return v === undefined ? '—' : `${Math.round(v)} MB`
}

function fmtBool(v: boolean | undefined | null): string {
  if (v === undefined) return '—'
  if (v === null) return 'disjoint'
  return v ? 'yes' : 'no'
}

export function EnvPopover() {
  const s = useDevtoolsState()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current !== null && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const canvas = s.canvasWidth !== undefined && s.canvasHeight !== undefined
    ? `${s.canvasWidth}×${s.canvasHeight}${s.canvasPixelRatio !== undefined ? ` @${s.canvasPixelRatio}x` : ''}`
    : '—'

  const summary = s.backendName !== undefined
    ? s.backendName
    : 'Env'

  return (
    <div class="env-popover" ref={rootRef}>
      <button
        type="button"
        class={`env-trigger${open ? ' env-trigger-open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        title="Runtime environment"
      >
        <span>Env</span>
        <span class="env-trigger-summary">{summary}</span>
        <span class="env-caret">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div class="env-menu">
          <Row label="three-flatland" value={s.threeFlatlandVersion ?? '—'} />
          <Row label="three revision" value={s.threeRevision ?? '—'} />
          <Row label="backend" value={s.backendName ?? '—'} />
          <Row label="canvas" value={canvas} />
          <Row label="gpu mode" value={fmtBool(s.gpuModeEnabled)} />
          <Row label="timestamps" value={fmtBool(s.backendTrackTimestamp)} />
          <Row label="disjoint" value={fmtBool(s.backendDisjoint)} />
          <Row label="heap" value={`${fmtMB(s.heapUsedMB)} / ${fmtMB(s.heapLimitMB)}`} />
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div class="env-row">
      <span class="env-label">{label}</span>
      <span class="env-value">{value}</span>
    </div>
  )
}
