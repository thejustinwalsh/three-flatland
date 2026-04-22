/** @jsxImportSource preact */
/**
 * Protocol log panel — virtualized, fixed-row, tail-pinned.
 *
 * The client mutates its `state` in place, so a time-series of *messages*
 * isn't available from state alone. A local ring buffer here is fed by
 * `addRawMessageListener`. Because messages arrive at up to ~4Hz × many
 * streams, we render a windowed slice of the ring — only rows in the
 * visible viewport mount to the DOM.
 *
 * Scroll model:
 *   - Newest entry at top (visual index 0), oldest at the bottom.
 *   - Tail on: scrollTop = 0 after every update; the viewport tracks
 *     the head of the stream.
 *   - Tail off: scrollTop stays put in terms of *content*, not pixels —
 *     each newly prepended entry bumps scrollTop by exactly ROW_HEIGHT
 *     so the rows the user is reading don't drift downward on screen.
 *   - User scrolls to within TAIL_RESUME_PIX of the top and holds for
 *     RESUME_TAIL_MS → auto-resume.
 *
 * Row detail:
 *   - Click a row → opens the side detail pane with the full message
 *     JSON. List height stays uniform; expanding/collapsing doesn't
 *     reflow the virtualized rows.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { DebugMessage } from 'three-flatland/debug-protocol'
import { getClient } from '../client.js'
import { exportSession } from '../export.js'
import { useDevtoolsState } from '../hooks.js'
import { getProtocolStore, type LogEntry } from '../protocol-store.js'

const ROW_HEIGHT = 22
const OVERSCAN = 6
const TAIL_RESUME_PIX = 4
const RESUME_TAIL_MS = 600

export function ProtocolLog() {
  const client = getClient()
  const store = getProtocolStore()
  const state = useDevtoolsState()
  const activeProviderId = state.selectedProviderId
  const [paused, setPaused] = useState(false)
  const pausedRef = useRef(false)
  pausedRef.current = paused
  const [filter, setFilter] = useState('')
  // Optional direction gate — `null` = both, 'in' / 'out' = pin to one.
  const [dirFilter, setDirFilter] = useState<'in' | 'out' | null>(null)
  // Bytes threshold — hide messages smaller than this. Useful for
  // spotting fat buffer:chunk frames while ignoring stats heartbeats.
  const [minBytes, setMinBytes] = useState(0)
  // Type multiselect — empty set = show all; otherwise only these.
  const [excludedTypes, setExcludedTypes] = useState<Set<string>>(() => new Set())
  const [filterMenuOpen, setFilterMenuOpen] = useState(false)
  const filterMenuRef = useRef<HTMLDivElement | null>(null)

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<LogEntry | null>(null)
  // Hover tracked by entry id, not DOM slot — slots get recycled as new
  // messages arrive, which means CSS `:hover` applied to a slot would
  // land on whichever entry happens to occupy the slot a frame later.
  // Tracking by id means the highlight stays on the entry the user is
  // actually pointing at.
  const [hoveredId, setHoveredId] = useState<number | null>(null)

  const [tail, setTail] = useState(true)
  const tailRef = useRef(true)
  tailRef.current = tail

  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const filterInputRef = useRef<HTMLInputElement | null>(null)
  const resumeTimerRef = useRef<number | null>(null)
  // Count of entries that arrived since the last render — used by the
  // post-render effect to compensate scrollTop when tail is off.
  const pendingBumpRef = useRef(0)
  const [viewport, setViewport] = useState({ scrollTop: 0, height: 0 })

  // Wire the raw-message tap → store. The store owns IDB persistence,
  // counters, cache + eviction; this listener translates raw messages
  // to log rows AND tags each with whichever provider was selected at
  // the moment it arrived, so per-provider scoping stays honest even
  // when the user switches mid-stream.
  useEffect(() => {
    return client.addRawMessageListener((msg, direction) => {
      if (pausedRef.current) return
      const providerId = client.state.selectedProviderId
      if (providerId === null) return
      store.push(providerId, {
        at: Date.now(),
        direction,
        type: msg.type,
        tag: extractTag(msg),
        frame: extractFrame(msg),
        bytes: estimateBytes(msg),
        msg,
      })
      if (providerId === activeProviderId) pendingBumpRef.current += 1
    })
  }, [client, store, activeProviderId])

  // The shared `useDevtoolsState` hook + store-driven listener both
  // tick through the dashboard-wide rAF scheduler, so we don't need our
  // own rAF here — the `state` read above is enough to re-render each
  // frame the store fires.

  // After each render but BEFORE paint: tail ON pins to top; tail OFF
  // bumps scrollTop by exactly the number of new rows prepended since
  // the last paint. Must be `useLayoutEffect` — if this ran in a regular
  // effect the browser would paint the grown-but-unscrolled state for
  // one frame, which reads as rows jumping down a row each update.
  // `> TAIL_RESUME_PIX` (not `> 0`) — when the user is actively
  // scrolling back toward the tail, we don't want automatic bumps
  // fighting their input. Within the band the resume timer handles it.
  useLayoutEffect(() => {
    const el = scrollerRef.current
    if (el === null) return
    if (tailRef.current) {
      el.scrollTop = 0
    } else if (pendingBumpRef.current > 0 && el.scrollTop > TAIL_RESUME_PIX) {
      el.scrollTop += pendingBumpRef.current * ROW_HEIGHT
    }
    pendingBumpRef.current = 0
  })

  // Capture scroller height for virtualization math. Updates on first
  // mount + any resize.
  useEffect(() => {
    const el = scrollerRef.current
    if (el === null) return
    setViewport((v) => ({ ...v, height: el.clientHeight }))
    const obs = new ResizeObserver(() => {
      const h = scrollerRef.current?.clientHeight ?? 0
      setViewport((v) => (v.height === h ? v : { ...v, height: h }))
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const onScroll = (e: Event): void => {
    const el = e.currentTarget as HTMLDivElement
    setViewport((v) => (v.scrollTop === el.scrollTop ? v : { ...v, scrollTop: el.scrollTop }))
    const atTail = el.scrollTop <= TAIL_RESUME_PIX
    if (atTail) {
      if (!tailRef.current) {
        if (resumeTimerRef.current !== null) window.clearTimeout(resumeTimerRef.current)
        resumeTimerRef.current = window.setTimeout(() => {
          if (scrollerRef.current !== null && scrollerRef.current.scrollTop <= TAIL_RESUME_PIX) {
            setTail(true)
          }
        }, RESUME_TAIL_MS)
      }
    } else if (tailRef.current) {
      if (resumeTimerRef.current !== null) {
        window.clearTimeout(resumeTimerRef.current)
        resumeTimerRef.current = null
      }
      setTail(false)
    }
  }

  useEffect(() => {
    if (!filterMenuOpen) return
    const onDocClick = (e: MouseEvent) => {
      const root = filterMenuRef.current
      if (root !== null && !root.contains(e.target as Node)) setFilterMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [filterMenuOpen])

  const toggleTail = (): void => {
    const next = !tail
    setTail(next)
    if (next) {
      const el = scrollerRef.current
      if (el !== null) el.scrollTop = 0
    }
  }

  // Virtualization math, scoped to the active provider. Per-provider
  // ids array is dense (append-only) so visual index i maps to
  // ids[total-1-i].
  const stats = store.statsFor(activeProviderId)
  const allIds = stats.ids
  const allTotal = stats.total

  // Filter currently walks the hot cache only. Fine for live tailing;
  // proper "filter across entire session" belongs on an indexed IDB
  // query (future work — hook up when filter is non-empty by querying
  // ranges and collecting matches).
  const needle = filter.trim().toLowerCase()
  const filterSpec: FilterSpec = {
    needle,
    dir: dirFilter,
    minBytes,
    excluded: excludedTypes,
  }
  const hasActiveFilter = needle.length > 0
    || dirFilter !== null
    || minBytes > 0
    || excludedTypes.size > 0

  // Filter pipeline is authoritative — when a filter is active, we
  // query IDB directly via the store's `queryFiltered` cursor. Query
  // is debounced so typing doesn't thrash the cursor. While a query is
  // in-flight, render the previous result to avoid empty-state flashes.
  // New arrivals append their id to `filteredIds` synchronously in the
  // raw-message listener when they match, so live tail keeps working
  // without a re-query.
  const [filteredIds, setFilteredIds] = useState<number[]>([])
  const [filterLoading, setFilterLoading] = useState(false)
  // Ref to the current filter predicate so the raw-message listener
  // can test new arrivals without capturing stale filter state.
  const filterPredicateRef = useRef<((e: LogEntry) => boolean) | null>(null)
  filterPredicateRef.current = hasActiveFilter ? (e: LogEntry) => matchesFilter(e, filterSpec) : null

  useEffect(() => {
    if (!hasActiveFilter || activeProviderId === null) {
      setFilteredIds([])
      setFilterLoading(false)
      return
    }
    const signal = { aborted: false }
    const predicate = filterPredicateRef.current!
    setFilterLoading(true)
    const handle = (globalThis.setTimeout as unknown as (cb: () => void, ms: number) => number)(
      () => {
        void store.queryFiltered(activeProviderId, predicate, signal).then((result) => {
          if (signal.aborted) return
          setFilteredIds(result)
          setFilterLoading(false)
        })
      },
      150,
    )
    return () => {
      signal.aborted = true
      clearTimeout(handle)
    }
    // Filter primitives as deps; `filterPredicateRef.current` is read
    // inside but kept stable against renders via the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, activeProviderId, hasActiveFilter, needle, dirFilter, minBytes, excludedTypes])

  // Live-append: when a new message matches the active filter, extend
  // `filteredIds` without re-querying. Subscribes to raw messages
  // independently of the append-to-store listener higher up.
  useEffect(() => {
    if (!hasActiveFilter || activeProviderId === null) return
    return client.addRawMessageListener(() => {
      const pred = filterPredicateRef.current
      if (pred === null) return
      // The entry was just pushed into the store above us in the
      // listener chain. Look it up by maxId.
      const s = store.statsFor(activeProviderId)
      const latest = s.ids[s.ids.length - 1]
      if (latest === undefined) return
      const entry = store.peek(activeProviderId, latest)
      if (entry === null) return
      if (!pred(entry)) return
      setFilteredIds((prev) => {
        if (prev.length > 0 && prev[prev.length - 1] === latest) return prev
        return [...prev, latest]
      })
    })
  }, [client, store, activeProviderId, hasActiveFilter])

  const ids = hasActiveFilter ? filteredIds : allIds
  const total = ids.length

  // Move selection by `delta` positions (newest-first ordering). Used
  // by j/k shortcuts below.
  const moveSelection = (delta: number): void => {
    if (total === 0 || activeProviderId === null) return
    let visualIdx = 0
    if (selectedId !== null) {
      for (let i = 0; i < total; i++) {
        if (ids[total - 1 - i] === selectedId) { visualIdx = i; break }
      }
    }
    const nextIdx = Math.max(0, Math.min(total - 1, visualIdx + delta))
    const nextId = ids[total - 1 - nextIdx]
    if (nextId !== undefined) setSelectedId(nextId)
  }

  // Keyboard shortcuts. Active whenever the panel is mounted; typing
  // inside inputs passes through so `/`-to-focus doesn't steal regular
  // filter input.
  useEffect(() => {
    const isTypingTarget = (t: EventTarget | null): boolean => {
      if (!(t instanceof HTMLElement)) return false
      const tag = t.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedId !== null) { setSelectedId(null); e.preventDefault() }
        return
      }
      if (isTypingTarget(e.target)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '/') {
        filterInputRef.current?.focus()
        filterInputRef.current?.select()
        e.preventDefault()
      } else if (e.key === 'j' || e.key === 'J') {
        moveSelection(1)
        e.preventDefault()
      } else if (e.key === 'k' || e.key === 'K') {
        moveSelection(-1)
        e.preventDefault()
      } else if (e.key === 'Enter' || e.key === ' ') {
        toggleTail()
        e.preventDefault()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, tail, activeProviderId, total])

  const start = Math.max(0, Math.floor(viewport.scrollTop / ROW_HEIGHT) - OVERSCAN)
  const visibleCount = Math.max(1, Math.ceil(viewport.height / ROW_HEIGHT) + OVERSCAN * 2)
  const end = Math.min(total, start + visibleCount)

  // Window-scope prefetch (unfiltered case). When filter is active the
  // bulk prefetch above covers it.
  const startId = end > 0 && total > 0 ? ids[Math.max(0, total - end)] ?? 0 : 0
  const endId = total > 0 ? ids[Math.max(0, total - 1 - start)] ?? 0 : 0
  useEffect(() => {
    if (hasActiveFilter) return
    if (activeProviderId === null || startId === 0 || startId > endId) return
    let needsFetch = false
    for (let i = start; i < end; i++) {
      const id = ids[total - 1 - i]
      if (id === undefined) continue
      if (store.peek(activeProviderId, id) === null) { needsFetch = true; break }
    }
    if (needsFetch) void store.prefetchRange(activeProviderId, startId, endId)
  }, [store, activeProviderId, hasActiveFilter, startId, endId, start, end, total, ids])

  type Row = LogEntry | { kind: 'loading'; id: number }
  const rows: Row[] = []
  for (let i = start; i < end; i++) {
    const id = ids[total - 1 - i] ?? 0
    const entry = activeProviderId !== null ? store.peek(activeProviderId, id) : null
    if (entry === null) rows.push({ kind: 'loading', id })
    else rows.push(entry)
  }

  // Selection follows the active provider. Swapping providers clears
  // any cross-provider selection.
  useEffect(() => {
    if (selectedId === null || activeProviderId === null) { setSelectedEntry(null); return }
    const cached = store.peek(activeProviderId, selectedId)
    if (cached !== null) { setSelectedEntry(cached); return }
    let cancelled = false
    void store.prefetchRange(activeProviderId, selectedId, selectedId).then(() => {
      if (cancelled) return
      const fetched = store.peek(activeProviderId, selectedId)
      if (fetched !== null) setSelectedEntry(fetched)
    })
    return () => { cancelled = true }
  }, [store, activeProviderId, selectedId])
  const selected = selectedEntry

  const backlog = 0

  return (
    <section class="panel protocol-panel">
      <header class="panel-header protocol-header">
        <span>Protocol</span>
        <input
          type="text"
          class="protocol-filter"
          placeholder="filter… (/)"
          value={filter}
          ref={filterInputRef}
          onInput={(e) => setFilter((e.target as HTMLInputElement).value)}
        />
        {hasActiveFilter && (
          <span class="protocol-match-count" title="Matches / total">
            {filterLoading ? '…' : `${total}/${allTotal}`}
          </span>
        )}
        <button
          type="button"
          class="protocol-btn"
          onClick={() => {
            setFilter('')
            setDirFilter(null)
            setMinBytes(0)
            setExcludedTypes(new Set())
          }}
          disabled={!hasActiveFilter}
          title="Reset all filters"
        >
          ✕ Reset
        </button>
        <div class="protocol-dir-toggle" role="group" aria-label="Direction filter">
          <button
            type="button"
            class={dirFilter === 'in' ? 'protocol-btn protocol-btn-on' : 'protocol-btn'}
            onClick={() => setDirFilter((d) => (d === 'in' ? null : 'in'))}
            title="Show inbound messages only"
          >
            <span class="header-arrow-in">↓</span>
          </button>
          <button
            type="button"
            class={dirFilter === 'out' ? 'protocol-btn protocol-btn-on' : 'protocol-btn'}
            onClick={() => setDirFilter((d) => (d === 'out' ? null : 'out'))}
            title="Show outbound messages only"
          >
            <span class="header-arrow-out">↑</span>
          </button>
        </div>
        <div class="protocol-filter-menu-wrap" ref={filterMenuRef}>
          <button
            type="button"
            class={
              (minBytes > 0 || excludedTypes.size > 0
                ? 'protocol-btn protocol-btn-on'
                : 'protocol-btn')
            }
            onClick={() => setFilterMenuOpen((o) => !o)}
            title="Type + size filters"
          >
            ▼ Filter
          </button>
          {filterMenuOpen && (
            <FilterMenu
              store={store}
              minBytes={minBytes}
              setMinBytes={setMinBytes}
              excludedTypes={excludedTypes}
              setExcludedTypes={setExcludedTypes}
              onClose={() => setFilterMenuOpen(false)}
            />
          )}
        </div>
        <button
          type="button"
          class={tail ? 'protocol-btn protocol-btn-on' : 'protocol-btn'}
          onClick={toggleTail}
          title="Toggle live tail. When off, the viewport anchors to whatever you're currently reading; new entries slide in above."
        >
          {tail ? '◉ Tail' : backlog > 0 ? `○ Tail (+${backlog})` : '○ Tail'}
        </button>
        <button
          type="button"
          class={paused ? 'protocol-btn protocol-btn-on' : 'protocol-btn'}
          onClick={() => setPaused((p) => !p)}
        >
          {paused ? '▶ Resume' : '⏸ Pause'}
        </button>
        <button
          type="button"
          class="protocol-btn"
          onClick={() => void exportSession(activeProviderId)}
          title="Download the session log as JSON"
          disabled={activeProviderId === null}
        >
          ⬇ Export
        </button>
        <button
          type="button"
          class="protocol-btn"
          onClick={() => {
            store.clear()
            setSelectedId(null)
          }}
          title="Drop all entries from memory and IndexedDB."
        >
          Clear
        </button>
      </header>
      <div class="protocol-layout">
        <div class="protocol-body" ref={scrollerRef} onScroll={onScroll}>
          {total === 0 ? (
            <div class="panel-empty">No messages{needle.length > 0 ? ' match' : ' yet'}.</div>
          ) : (
            <div class="protocol-spacer" style={{ height: `${total * ROW_HEIGHT}px` }}>
              {rows.map((r, i) => {
                // Key by virtual slot index so the same DOM element is
                // re-used as ids scroll past — content + top style
                // update in place instead of Preact inserting / moving
                // keyed nodes, which would cause a 1-frame flash when a
                // new entry takes over the top slot. Always render as
                // `<button>` (placeholder just dims + disables click)
                // so slot tag never switches, keeping Preact's in-place
                // update path.
                const offsetTop = (start + i) * ROW_HEIGHT
                const isLoading = 'kind' in r
                const isPlaceholder = isLoading
                const e = isPlaceholder ? null : (r as LogEntry)
                const id = isPlaceholder ? (r as { id: number }).id : e!.id
                const isHover = !isPlaceholder && hoveredId === id
                const isSelected = !isPlaceholder && selectedId === id
                let cls = 'protocol-row'
                if (isLoading) cls += ' protocol-row-placeholder'
                else {
                  cls += ` protocol-row-${e!.direction}`
                  if (isSelected) cls += ' protocol-row-selected'
                  if (isHover) cls += ' protocol-row-hover'
                }
                return (
                  <button
                    key={i}
                    type="button"
                    class={cls}
                    style={{ transform: `translateY(${offsetTop}px)`, height: `${ROW_HEIGHT}px` }}
                    onClick={isPlaceholder ? undefined : () => setSelectedId((x) => (x === id ? null : id))}
                    onMouseEnter={isPlaceholder ? undefined : () => setHoveredId(id)}
                    onMouseLeave={isPlaceholder ? undefined : () => setHoveredId((h) => (h === id ? null : h))}
                    title={isPlaceholder ? undefined : new Date(e!.at).toISOString()}
                    disabled={isPlaceholder}
                  >
                    <span class="protocol-dir">{isPlaceholder ? '·' : e!.direction === 'in' ? '↓' : '↑'}</span>
                    <span class="protocol-time">{isLoading ? 'loading…' : formatTime(e!.at)}</span>
                    <span class="protocol-frame">{!isPlaceholder && e!.frame !== undefined ? `#${e!.frame}` : ''}</span>
                    <span class="protocol-type">{isPlaceholder ? '' : e!.type}</span>
                    <span class="protocol-tag">{isPlaceholder ? '' : e!.tag ?? ''}</span>
                    <span class="protocol-size">{isPlaceholder ? '' : formatBytes(e!.bytes)}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
        {selected !== null && (
          <aside class="protocol-detail">
            <div class="protocol-detail-header">
              <span class="protocol-detail-title">
                {selected.direction === 'in' ? '↓ ' : '↑ '}
                {selected.type}
                {selected.tag !== undefined && <span class="protocol-tag"> · {selected.tag}</span>}
              </span>
              <button
                type="button"
                class="protocol-btn"
                onClick={() => setSelectedId(null)}
                aria-label="Close detail"
              >×</button>
            </div>
            <div class="protocol-detail-meta">
              <span>{formatTime(selected.at)}</span>
              {selected.frame !== undefined && <span>frame #{selected.frame}</span>}
              <span>{formatBytes(selected.bytes)}</span>
            </div>
            <pre
              class="protocol-detail-body"
              dangerouslySetInnerHTML={{ __html: highlightJson(stringify(selected.msg as DebugMessage)) }}
            />
          </aside>
        )}
      </div>
    </section>
  )
}

interface FilterSpec {
  needle: string
  dir: 'in' | 'out' | null
  minBytes: number
  excluded: Set<string>
}

function FilterMenu({
  store,
  minBytes,
  setMinBytes,
  excludedTypes,
  setExcludedTypes,
  onClose: _onClose,
}: {
  store: ReturnType<typeof getProtocolStore>
  minBytes: number
  setMinBytes: (n: number) => void
  excludedTypes: Set<string>
  setExcludedTypes: (s: Set<string>) => void
  onClose: () => void
}): preact.JSX.Element {
  const types = Array.from(store.knownTypes).sort()
  const toggle = (t: string): void => {
    const next = new Set(excludedTypes)
    if (next.has(t)) next.delete(t)
    else next.add(t)
    setExcludedTypes(next)
  }
  return (
    <div class="protocol-filter-menu">
      <div class="protocol-filter-menu-section">
        <div class="protocol-filter-menu-title">Minimum size</div>
        <input
          type="range"
          min={0}
          max={65536}
          step={64}
          value={minBytes}
          onInput={(e) => setMinBytes(Number((e.target as HTMLInputElement).value))}
        />
        <span class="protocol-filter-menu-value">
          {minBytes === 0 ? 'any' : minBytes < 1024 ? `${minBytes} B` : `${(minBytes / 1024).toFixed(1)} KB`}
        </span>
      </div>
      <div class="protocol-filter-menu-section">
        <div class="protocol-filter-menu-title">
          Hidden types
          {excludedTypes.size > 0 && (
            <button
              type="button"
              class="protocol-btn protocol-filter-menu-clear"
              onClick={() => setExcludedTypes(new Set())}
            >reset</button>
          )}
        </div>
        <ul class="protocol-filter-types">
          {types.length === 0 ? (
            <li class="panel-empty">No types yet.</li>
          ) : (
            types.map((t) => (
              <li key={t}>
                <label class="protocol-filter-type">
                  <input
                    type="checkbox"
                    checked={!excludedTypes.has(t)}
                    onChange={() => toggle(t)}
                  />
                  <span>{t}</span>
                </label>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}

function matchesFilter(e: LogEntry, f: FilterSpec): boolean {
  if (f.dir !== null && e.direction !== f.dir) return false
  if (f.minBytes > 0 && e.bytes < f.minBytes) return false
  if (f.excluded.has(e.type)) return false
  if (f.needle.length === 0) return true
  if (e.type.includes(f.needle)) return true
  if (e.tag !== undefined && e.tag.toLowerCase().includes(f.needle)) return true
  return false
}

function extractTag(msg: DebugMessage): string | undefined {
  if (msg.type === 'data') {
    const features = (msg as unknown as { payload?: { features?: Record<string, unknown> } }).payload?.features
    if (features !== undefined) {
      const keys = Object.keys(features).filter((k) => features[k] != null)
      return keys.length > 0 ? keys.join(',') : 'empty'
    }
  }
  const p = (msg as unknown as { payload?: { name?: string } }).payload
  if (p !== undefined && typeof p === 'object' && typeof p.name === 'string') return p.name
  return undefined
}

function extractFrame(msg: DebugMessage): number | undefined {
  const f = (msg as unknown as { payload?: { frame?: number } }).payload?.frame
  return typeof f === 'number' ? f : undefined
}

function estimateBytes(msg: DebugMessage): number {
  let bytes = 0
  const seen = new WeakSet<object>()
  const walk = (v: unknown): void => {
    if (v === null || v === undefined) return
    if (typeof v === 'string') { bytes += v.length; return }
    if (typeof v === 'number' || typeof v === 'boolean') { bytes += 8; return }
    if (v instanceof ArrayBuffer) { bytes += v.byteLength; return }
    if (ArrayBuffer.isView(v)) { bytes += v.byteLength; return }
    if (typeof v === 'object') {
      if (seen.has(v as object)) return
      seen.add(v as object)
      if (Array.isArray(v)) { for (const x of v) walk(x); return }
      for (const k in v as Record<string, unknown>) {
        bytes += k.length
        walk((v as Record<string, unknown>)[k])
      }
    }
  }
  walk(msg)
  return bytes
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}K`
  return `${(n / (1024 * 1024)).toFixed(1)}M`
}

function formatTime(at: number): string {
  const d = new Date(at)
  const ms = d.getMilliseconds().toString().padStart(3, '0')
  return `${d.toLocaleTimeString([], { hour12: false })}.${ms}`
}

function stringify(msg: DebugMessage): string {
  try {
    return JSON.stringify(msg, (_k, v) => {
      if (v instanceof ArrayBuffer) return `[ArrayBuffer ${v.byteLength}B]`
      if (ArrayBuffer.isView(v)) return `[${v.constructor.name} ${v.byteLength}B]`
      return v
    }, 2)
  } catch {
    return '[unserialisable]'
  }
}

/**
 * Tiny JSON syntax highlighter. Takes a `JSON.stringify(obj, null, 2)`
 * string and wraps tokens (keys, strings, numbers, booleans, null) in
 * spans with `.json-*` classes. Not a real parser — the input always
 * comes from `JSON.stringify` so the token grammar is well-formed and a
 * single regex pass is enough. HTML-escapes first to avoid injecting
 * arbitrary markup from message payloads.
 */
function highlightJson(json: string): string {
  const escaped = json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped.replace(
    /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = 'json-num'
      if (match.startsWith('"')) {
        cls = match.endsWith(':') || match.endsWith(': ') ? 'json-key' : 'json-str'
      } else if (match === 'true' || match === 'false') {
        cls = 'json-bool'
      } else if (match === 'null') {
        cls = 'json-null'
      }
      return `<span class="${cls}">${match}</span>`
    },
  )
}
