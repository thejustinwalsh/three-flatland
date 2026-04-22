/** @jsxImportSource preact */
/**
 * Registry panel — CPU-array inspection.
 *
 * Every producer entry registered via `registerDebugArray` arrives in
 * `DevtoolsState.registry` as a typed-array sample + metadata. This panel
 * is a two-pane master/detail: list of entries grouped by name prefix on
 * the left, selected entry's values on the right.
 *
 * Sample values render in a `<pre>` grid of fixed-width numeric cells.
 * For small counts this is just a flat list; for larger arrays we chunk
 * into rows of 8 with an index column so scrolling large buffers is
 * comprehensible. No virtualization yet — arrays rarely exceed a few
 * thousand entries and the render cost is negligible.
 */
import { useMemo, useState } from 'preact/hooks'
import type { RegistryEntrySnapshot } from '../../devtools-client.js'
import { useDevtoolsState } from '../hooks.js'

const ROW_STRIDE = 8

export function RegistryPanel() {
  const state = useDevtoolsState()
  const [selected, setSelected] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  // Stable sorted list so toggling filter or a new entry arriving doesn't
  // reshuffle the master pane.
  const entries = useMemo(() => {
    const arr = Array.from(state.registry.values())
    arr.sort((a, b) => a.name.localeCompare(b.name))
    return arr
  }, [state.registry, state.registry.size])

  const needle = filter.trim().toLowerCase()
  const visible = needle.length > 0
    ? entries.filter((e) => e.name.toLowerCase().includes(needle) || (e.label?.toLowerCase().includes(needle) ?? false))
    : entries

  // Repair the selection if the current pick vanished or isn't in the
  // filter result.
  const effectiveSelected = selected !== null && visible.some((e) => e.name === selected)
    ? selected
    : (visible[0]?.name ?? null)

  const selectedEntry = effectiveSelected !== null ? state.registry.get(effectiveSelected) ?? null : null

  return (
    <section class="panel registry-panel">
      <header class="panel-header registry-header">
        <span>Registry</span>
        <input
          type="text"
          class="protocol-filter"
          placeholder="filter…"
          value={filter}
          onInput={(e) => setFilter((e.target as HTMLInputElement).value)}
        />
        <span class="registry-count">{entries.length}</span>
      </header>
      <div class="registry-layout">
        <ul class="registry-list">
          {visible.length === 0 ? (
            <li class="panel-empty">No entries{needle.length > 0 ? ' match' : ' yet'}.</li>
          ) : (
            visible.map((e) => (
              <li key={e.name}>
                <button
                  type="button"
                  class={
                    'registry-row' +
                    (e.name === effectiveSelected ? ' registry-row-selected' : '')
                  }
                  onClick={() => setSelected(e.name)}
                >
                  <span class="registry-kind">{e.kind}</span>
                  <span class="registry-name">{e.name}</span>
                  <span class="registry-count-pill">{e.count}</span>
                </button>
              </li>
            ))
          )}
        </ul>
        <div class="registry-detail">
          {selectedEntry === null ? (
            <div class="panel-empty">Select an entry.</div>
          ) : (
            <RegistryDetail entry={selectedEntry} />
          )}
        </div>
      </div>
    </section>
  )
}

function RegistryDetail({ entry }: { entry: RegistryEntrySnapshot }): preact.JSX.Element {
  const { name, kind, count, sample, label, version } = entry
  const isFloat = sample instanceof Float32Array
  return (
    <>
      <div class="registry-detail-header">
        <span class="registry-detail-name">{name}</span>
        {label !== undefined && <span class="registry-detail-label">{label}</span>}
      </div>
      <div class="registry-detail-meta">
        <span>{kind}</span>
        <span>count {count}</span>
        <span>v{version}</span>
        <span>{sample.constructor.name}</span>
      </div>
      <div class="registry-detail-body">
        {sample.length === 0
          ? <div class="panel-empty">No sample yet.</div>
          : <SampleGrid sample={sample} stride={ROW_STRIDE} float={isFloat} />}
      </div>
    </>
  )
}

function SampleGrid({ sample, stride, float }: {
  sample: Float32Array | Uint32Array | Int32Array
  stride: number
  float: boolean
}): preact.JSX.Element {
  const rows: preact.JSX.Element[] = []
  for (let i = 0; i < sample.length; i += stride) {
    const cells: preact.JSX.Element[] = []
    for (let j = 0; j < stride && i + j < sample.length; j++) {
      const v = sample[i + j]!
      cells.push(<span class="sample-cell">{float ? fmtFloat(v) : v.toString()}</span>)
    }
    rows.push(
      <div class="sample-row" key={i}>
        <span class="sample-index">{i}</span>
        {cells}
      </div>,
    )
  }
  return <div class="sample-grid">{rows}</div>
}

function fmtFloat(v: number): string {
  if (!Number.isFinite(v)) return String(v)
  if (v === 0) return '0'
  const abs = Math.abs(v)
  if (abs >= 1e5 || abs < 1e-3) return v.toExponential(2)
  return v.toFixed(4).replace(/\.?0+$/, '')
}
